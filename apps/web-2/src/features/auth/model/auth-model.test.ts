import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ErrorCode, FieldError } from '#/shared/api/gen/types.gen'

import { loginSearchSchema, opensVerifyLink, verifyEmailSearchSchema } from '../route'
import {
  isBadEmail,
  isResetCodeInvalid,
  isWrongCode,
  resetFormError,
  signupFieldOf,
  vSignupForm,
} from './account-search'
import { enrolsAfterAuth, googleErrorText, googleStartHref, guestBack, retryMinutes } from './login-search'

const redirectOf = (value: unknown) => v.parse(loginSearchSchema, { redirect: value }).redirect
const apiError = (code: ErrorCode, fieldErrors: FieldError[] = []) =>
  new ApiError({ status: 422, code, fieldErrors, requestId: null, retryAfter: null })

describe('auth model', () => {
  test('B-AUTH-17 «Назад» returns to the public page the guest came from; «Записаться» there is announced', () => {
    const enrol = '/courses/c1/about?enroll=1'
    expect(guestBack(enrol)).toBe('/courses/c1/about')
    expect(guestBack('/collections/x?q=1')).toBe('/collections/x?q=1')
    expect(guestBack('/learn/c1/a1')).toBe('/')
    expect(guestBack(undefined)).toBe('/')
    expect(guestBack('//evil.example/courses')).toBe('/')
    expect([enrolsAfterAuth(enrol), enrolsAfterAuth('/courses/c1/about'), enrolsAfterAuth(undefined)]).toEqual([
      true,
      false,
      false,
    ])
  })

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

  test('B-AUTH-05 the Google link carries only a safe callback, back through /login (the profile language)', () => {
    expect(googleStartHref('/collections?q=a b')).toBe(
      '/api/v2/auth/google?callback=%2Flogin%3Fredirect%3D%252Fcollections%253Fq%253Da%2520b',
    )
    expect(googleStartHref('//evil.example')).toBe('/api/v2/auth/google?callback=%2Flogin%3Fredirect%3D%252Fhome')
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

test('B-AUTH-06 an empty or malformed address is caught with the other fields, before the server', () => {
  const body = { first_name: 'A', last_name: 'B', organization: 'C', username: 'abc', password: 'Strong-Pass1!' }
  const emailIssue = (email: string) =>
    v.safeParse(vSignupForm, { ...body, email }).issues?.find(issue => issue.path?.[0]?.key === 'email')?.type
  expect(emailIssue('')).toBe('non_empty')
  expect(emailIssue('name.example.com')).toBe('email')
  expect(emailIssue(' name@example.com ')).toBeUndefined()
})

test('B-AUTH-14 a 422 on the address of a resend goes under the email field', () => {
  expect(isBadEmail(apiError('validation-failed', [{ field: 'email', code: 'invalid', message: '' }]))).toBe(true)
  expect(isBadEmail(apiError('validation-failed', [{ field: 'code', code: 'invalid', message: '' }]))).toBe(false)
  expect(isBadEmail(apiError('rate-limited'))).toBe(false)
})

test('B-AUTH-08 the emailed link stays open for a signed-in account whose address is unconfirmed', () => {
  const link = { pathname: '/verify-email', search: { email: 'a@b.kz', code: 'X1Y2Z3' } }
  const unconfirmed = { user: { email_verified: false } }
  expect(opensVerifyLink(link, unconfirmed)).toBe(true)
  expect(opensVerifyLink(link, { user: { email_verified: true } })).toBe(false)
  expect(opensVerifyLink(link, null)).toBe(false)
  expect(opensVerifyLink({ pathname: '/verify-email', search: {} }, unconfirmed)).toBe(false)
  expect(opensVerifyLink({ pathname: '/login', search: { code: 'x' } }, unconfirmed)).toBe(false)
})

test('B-AUTH-05 a Google return error says what happened, never «check the highlighted fields»', () => {
  expect(googleErrorText('google-cancelled')).toBe(m.auth_login_error_google_cancelled())
  expect(googleErrorText('validation-failed')).toBe(m.auth_login_error_google_failed())
  expect(googleErrorText('account-disabled')).not.toBe(m.auth_login_error_google_failed())
})
