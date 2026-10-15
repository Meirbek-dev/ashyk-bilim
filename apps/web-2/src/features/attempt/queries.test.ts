import { QueryClient } from '@tanstack/react-query'
import { expect, test, vi } from 'vite-plus/test'

import type { StudentSubmission } from '#/shared/api/gen/types.gen'

import { noteViolations, submissionKey } from './queries'

const read: StudentSubmission = {
  answered_count: 0,
  answers: {},
  assessment_id: 'a1',
  attempt_number: 1,
  auto_score: null,
  auto_submit_reason: null,
  draft_version: 1,
  final_score: null,
  graded_at_unix: null,
  grading: null,
  id: 's1',
  is_late: false,
  late_penalty_pct: null,
  release_state: 'hidden',
  started_at_unix: 1,
  status: 'draft',
  submitted_at_unix: null,
  time_remaining_seconds: 600,
  time_remaining_reason: 'time_expired',
  total_items: 1,
  violation_count: 0,
}

test('B-ATT-14 B-ATT-21 a reported violation keeps the read time, so the exam clock does not wind back', () => {
  vi.useFakeTimers({ now: 1_000_000 })
  const queryClient = new QueryClient()
  queryClient.setQueryData(submissionKey(read.id), read)
  vi.advanceTimersByTime(7000)
  noteViolations(queryClient, read.id, 1)
  const state = queryClient.getQueryState<StudentSubmission>(submissionKey(read.id))
  expect(state?.data?.violation_count).toBe(1)
  expect(state?.data?.time_remaining_seconds).toBe(600)
  expect(state?.dataUpdatedAt).toBe(1_000_000)
  vi.useRealTimers()
})
