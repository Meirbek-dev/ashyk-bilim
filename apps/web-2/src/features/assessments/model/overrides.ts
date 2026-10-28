import * as v from 'valibot'

import type { OverrideRequest, StudentOverride } from '#/shared/api/gen/types.gen'
import { vOverrideRequest } from '#/shared/api/gen/valibot.gen'
import { m } from '#/paraglide/messages'
import { toDateTimeInput } from '#/shared/i18n/format'

import { momentOf } from './moment'
import { attemptsText } from './policy'

// A learner's exception: attempts, a personal deadline, no late penalty, a note. Create and update share the block;
// the update replaces it, so an expiry set elsewhere goes back as it was (BUG-317).

export type OverrideForm = { user_id: string; attempts: string; due_at: string; waive: boolean; note: string }

const overrideObject = v.object({
  user_id: v.pipe(v.string(), v.nonEmpty()),
  // 0 or 11 were sent and came back as a bare «Проверьте выделенные поля»: the server names `max_attempts_override`.
  attempts: attemptsText,
  due_at: v.pipe(
    v.string(),
    v.check(value => value === '' || momentOf(value) !== null),
  ),
  waive: v.boolean(),
  note: vOverrideRequest.entries.note.wrapped,
})

/** An exception changes something: attempts, a deadline or the late penalty (a bare one listed the learner, no terms). */
export const overrideFormSchema = v.pipe(
  overrideObject,
  v.forward(
    v.check(
      (form: v.InferOutput<typeof overrideObject>) => form.attempts.trim() !== '' || form.due_at !== '' || form.waive,
      () => m.assessments_exception_empty(),
    ),
    ['attempts'],
  ),
)

export const blankOverride: OverrideForm = { user_id: '', attempts: '', due_at: '', waive: false, note: '' }

export const overrideForm = (row: StudentOverride): OverrideForm => ({
  user_id: row.user_id,
  attempts: row.max_attempts_override === null ? '' : String(row.max_attempts_override),
  due_at: row.due_at_override_unix === null ? '' : toDateTimeInput(row.due_at_override_unix),
  waive: row.waive_late_penalty,
  note: row.note,
})

export function overrideBody(form: OverrideForm, stored?: StudentOverride): OverrideRequest {
  const due = momentOf(form.due_at)
  return {
    ...(form.attempts.trim() ? { max_attempts_override: Number(form.attempts) } : {}),
    ...(due === null ? {} : { due_at_override_unix: due }),
    ...(stored?.expires_at_unix ? { expires_at_unix: stored.expires_at_unix } : {}),
    waive_late_penalty: form.waive,
    note: form.note,
  }
}
