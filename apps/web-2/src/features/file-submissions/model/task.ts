import type { Attempt, FileRefRequest, FileSubmission } from '#/shared/api/gen/types.gen'
import type { UploadLimits } from '#/shared/api/upload'

const MB = 1024 * 1024

/**
 * What the learner's work area shows, from the newest attempt alone (the server sends no learner actions):
 * `edit` - no attempt, a draft or a returned one (files can change); `waiting` - submitted or graded but not released;
 * `done` - the grade is out.
 */
export type Work =
  | { kind: 'edit'; attempt: Attempt | null }
  | { kind: 'waiting'; attempt: Attempt }
  | { kind: 'done'; attempt: Attempt }

export function workOf(task: FileSubmission): Work {
  const attempt = task.current_attempt
  if (!attempt || attempt.status === 'draft' || attempt.status === 'returned') return { kind: 'edit', attempt }
  if (attempt.status === 'published') return { kind: 'done', attempt }
  return { kind: 'waiting', attempt }
}

/** The open attempt (draft or returned) that a file change or a submit acts on; null = the server opens one. */
export const openAttempt = (task: FileSubmission): Attempt | null => {
  const work = workOf(task)
  return work.kind === 'edit' ? work.attempt : null
}

/** A new attempt is possible after a released grade while the cap (if any) is not spent. */
export const attemptsLeft = (task: FileSubmission): boolean =>
  task.max_attempts === null || task.attempts.length < task.max_attempts

/** The number the attempt being submitted has (the open one, or the next). */
export const attemptNumber = (task: FileSubmission): number =>
  openAttempt(task)?.attempt_number ?? task.attempts.length + 1

/**
 * A change of the open attempt's files: the server takes the whole list each time. A file is named by its upload:
 * the attached-file rows are recreated on every save, so their ids do not survive a reload (B-FSB-12).
 */
export type FileChange = { add: FileRefRequest } | { remove: string }

export function changedFiles(attempt: Attempt | null, change: FileChange): FileRefRequest[] {
  const files = attempt?.files ?? []
  const kept = 'remove' in change ? files.filter(file => file.upload_id !== change.remove) : files
  const refs = kept.map(file => ({ upload_id: file.upload_id, display_name: file.filename }))
  return 'add' in change ? [...refs, change.add] : refs
}

/** One action on the open attempt; it is rebuilt on fresh data after a conflict (B-FSB-12). */
export type WorkAction = { kind: 'files'; change: FileChange } | { kind: 'submit' } | { kind: 'start' }

/** `If-Match` of a write: the open attempt's version, none when the write opens the attempt. */
export const versionHeader = (task: FileSubmission) => {
  const version = openAttempt(task)?.version
  return version === undefined ? {} : { 'If-Match': version }
}

/** An attempt the server answered goes into the cached task (newest first) instead of a refetch. */
export function withAttempt(task: FileSubmission, attempt: Attempt): FileSubmission {
  return { ...task, current_attempt: attempt, attempts: upsertAttempt(task.attempts, attempt) }
}

export function upsertAttempt(attempts: Attempt[], attempt: Attempt): Attempt[] {
  return attempts.some(item => item.id === attempt.id)
    ? attempts.map(item => (item.id === attempt.id ? attempt : item))
    : [attempt, ...attempts]
}

/** The task's own rules for the upload pre-check (`FileInput` `limits`). */
export const uploadLimits = (task: FileSubmission): UploadLimits => ({
  mimes: task.allowed_mime_types,
  maxBytes: task.max_file_size_mb === null ? null : task.max_file_size_mb * MB,
})

/** True once the deadline has passed (a label only: what is refused comes from `disabled_reasons`). */
export const pastDue = (task: FileSubmission, nowSeconds: number): boolean =>
  task.due_at_unix !== null && nowSeconds > task.due_at_unix

/** The late rule a learner reads; meaningful only with a deadline. */
export type LateRule =
  | { kind: 'closed' }
  | { kind: 'free' }
  | { kind: 'penalty'; percent: number; days: number }
  | { kind: 'cutoff'; at: number }

export function lateRule(task: FileSubmission): LateRule | null {
  if (task.due_at_unix === null) return null
  if (!task.allow_late) return { kind: 'closed' }
  const policy = task.late_policy
  if (policy.kind === 'penalty') return { kind: 'penalty', percent: policy.percent_per_day, days: policy.max_days }
  if (policy.kind === 'cutoff') return { kind: 'cutoff', at: policy.cutoff_at_unix }
  return { kind: 'free' }
}
