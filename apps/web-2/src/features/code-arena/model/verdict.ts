import type { CaseResult } from '#/shared/api/gen/types.gen'

/** One test's verdict. Never matched on status text (BUG-373: "RUNTIME" contains "TIME"). */
export type CaseVerdict =
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit'
  | 'compile_error'
  | 'runtime_error'
  | 'internal_error'
  | 'pending'

/**
 * Judge0 status ids: 1-2 queued/processing, 3 accepted (the server then compares the output), 4 wrong answer,
 * 5 time limit, 6 compile error, 7-12 runtime errors, 13-14 internal. No id: the run never reached the judge.
 */
export function caseVerdict(result: Pick<CaseResult, 'passed' | 'status_id'>): CaseVerdict {
  if (result.passed) return 'accepted'
  const id = result.status_id
  if (id === 1 || id === 2) return 'pending'
  if (id === 3 || id === 4) return 'wrong_answer'
  if (id === 5) return 'time_limit'
  if (id === 6) return 'compile_error'
  if (id !== null && id >= 7 && id <= 12) return 'runtime_error'
  return 'internal_error'
}
