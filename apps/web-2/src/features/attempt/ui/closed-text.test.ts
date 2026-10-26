import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { ErrorCode } from '#/shared/api/gen/types.gen'

import { closedText } from './closed-text'

const refusal = (status: number, code: ErrorCode) =>
  new ApiError({ status, code, fieldErrors: [], requestId: null, retryAfter: null })

describe('closedText', () => {
  test('B-ATT-15 each closed attempt says why in the learner’s words', () => {
    expect(closedText(refusal(409, 'course-archived'))).toBe(m.attempt_closed_archived())
    expect(closedText(refusal(404, 'not-found'))).toBe(m.attempt_closed_gone())
    expect(closedText(refusal(403, 'forbidden'))).toBe(m.attempt_closed())
  })
})
