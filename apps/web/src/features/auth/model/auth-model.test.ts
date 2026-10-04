import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'
import type { ErrorCode, FieldError } from '#/shared/api/gen/types.gen'

import { loginSearchSchema, verifyEmailSearchSchema } from '../route'
import { isResetCodeInvalid, isWrongCode, resetFormError, signupFieldOf } from './account-search'
import { googleStartHref, retryMinutes } from './login-search'

const redirectOf = (value: unknown) => v.parse(loginSearchSchema, { redirect: value }).redirect
const apiError = (code: ErrorCode, fieldErrors: FieldError[] = []) =>
  new ApiError({ status: 422, code, fieldErrors, requestId: null, retryAfter: null })

describe('auth model', () => {
  test.each(['/home', '/collections?q=x', '/learn/1/2#top'])('B-AUTH-02 keeps the internal path %s', path => {
    expect(redirectOf(path)).toBe(path)
  })

  test.each(['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', ''])(
    'B-AUTH-02 sends %j to /home',
    value => {
      expect(redirectOf(value)).toBe('/home')
    },
  )

  test('B-AUTH-02 a missing redirect stays missing; the error code of a failed Google sign-in is kept', () => {
    expect(v.parse(loginSearchSchema, { error: 'google-cancelled' })).toEqual({ error: 'google-cancelled' })
  })

  test('B-AUTH-05 the Google link carries only a safe callback', () => {
    expect(googleStartHref('/collections?q=a b')).toBe('/api/v2/auth/google?callback=%2Fcollections%3Fq%3Da%20b')
    expect(googleStartHref('//evil.example')).toBe('/api/v2/auth/google?callback=%2Fhome')
  })

  test('B-AUTH-03 a rate limit names whole minutes, at least one', () => {
    expect(retryMinutes(null)).toBeNull()
    expect(retryMinutes(5)).toBe(1)
    expect(retryMinutes(61)).toBe(2)
  })

  test('B-AUTH-06 username-taken and email-taken belong to their fields', () => {
    expect(signupFieldOf(apiError('username-taken'))).toBe('username')
    expect(signupFieldOf(apiError('email-taken'))).toBe('email')
    expect(signupFieldOf(apiError('validation-failed'))).toBeNull()
    expect(signupFieldOf(new Error('offline'))).toBeNull()
  })

  test('B-AUTH-08 the verification link fills email and code; a 422 on the code is a wrong code', () => {
    expect(v.parse(verifyEmailSearchSchema, { email: 'a@b.kz', code: 'X1' })).toEqual({ email: 'a@b.kz', code: 'X1' })
    expect(v.parse(verifyEmailSearchSchema, {})).toEqual({})
    expect(isWrongCode(apiError('validation-failed', [{ field: 'code', code: 'invalid', message: '' }]))).toBe(true)
    expect(isWrongCode(apiError('validation-failed', [{ field: 'email', code: 'invalid', message: '' }]))).toBe(false)
    expect(isWrongCode(apiError('rate-limited'))).toBe(false)
  })

  test('B-AUTH-13 reset-code-invalid goes under the code, a policy error under its field, the rest to the form', () => {
    const invalid = apiError('reset-code-invalid')
    const policy = apiError('validation-failed', [{ field: 'new_password', code: 'invalid', message: '' }])
    const limited = apiError('rate-limited')
    expect(isResetCodeInvalid(invalid)).toBe(true)
    expect(isResetCodeInvalid(limited)).toBe(false)
    expect(resetFormError(invalid)).toBeNull()
    expect(resetFormError(policy)).toBeNull()
    expect(resetFormError(limited)).toBe(limited)
  })
})
