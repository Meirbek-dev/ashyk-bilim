import { describe, expect, it } from 'vite-plus/test'

import { APIError, clientApiError } from '@/lib/api/assertSuccess'
import { presentApiError } from '@/lib/api/error-presenter'

describe('presentApiError', () => {
  it('maps validation envelopes to field errors without retry', () => {
    const error = new APIError({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      status: 422,
      fieldErrors: [{ field: 'title', message: 'Title is required' }],
      requestId: 'req-validation',
    })

    expect(presentApiError(error)).toMatchObject({
      code: 'VALIDATION_ERROR',
      description: 'Check the highlighted fields and try again.',
      fieldErrors: [{ field: 'title', message: 'Title is required' }],
      retryPolicy: 'none',
      showRetry: false,
      status: 422,
      supportReference: 'req-validation',
      telemetryExpected: false,
      title: 'Check the form',
    })
  })

  it('uses safe copy and telemetry for server failures', () => {
    const error = new APIError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'database host exploded',
      status: 500,
      requestId: 'req-500',
    })

    expect(presentApiError(error)).toMatchObject({
      description: 'Something went wrong. Retry or contact support with the reference below.',
      retryPolicy: 'manual',
      showRetry: true,
      supportReference: 'req-500',
      telemetryExpected: true,
      title: 'Something went wrong',
    })
  })

  it('treats expected not-found API errors as non-retryable and non-crashing', () => {
    const error = new APIError({
      code: 'COURSE_NOT_FOUND',
      message: 'Course was not found',
      status: 404,
      requestId: 'req-course',
    })

    expect(presentApiError(error)).toMatchObject({
      description: 'This item is no longer available or you do not have access.',
      retryPolicy: 'none',
      showRetry: false,
      telemetryExpected: false,
      title: 'Not found',
    })
  })

  it('allows deliberate code-specific public copy', () => {
    const error = new APIError({
      code: 'COURSE_NOT_FOUND',
      message: 'Course was not found',
      status: 404,
      requestId: 'req-course',
    })

    expect(
      presentApiError(error, {
        copy: { byCode: { COURSE_NOT_FOUND: 'This course is no longer available.' } },
      }),
    ).toMatchObject({
      description: 'This course is no longer available.',
      retryPolicy: 'none',
      title: 'Not found',
    })
  })

  it('marks timeout and network failures as retryable user-visible problems', () => {
    const error = clientApiError('CLIENT_TIMEOUT', 'The request took too long.')

    expect(presentApiError(error)).toMatchObject({
      description: 'The request took too long. Check your connection and retry.',
      retryPolicy: 'manual',
      severity: 'warning',
      showRetry: true,
      telemetryExpected: true,
      title: 'Connection problem',
    })
  })
})
