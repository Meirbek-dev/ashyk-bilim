import * as v from 'valibot'

import { vCreateInterventionRequest } from '#/shared/api/gen/valibot.gen'

// `intervention_type` and `status` are strings documented with these values (SPEC: waits for enums); the server
// rejects anything else with a field error (`INTERVENTION_TYPES` / `INTERVENTION_STATUSES` in domain/analytics).
export const INTERVENTION_TYPES = [
  'message_sent',
  'submission_graded',
  'extension_granted',
  'meeting_scheduled',
  'learner_recovered',
] as const
export const INTERVENTION_STATUSES = ['planned', 'completed', 'resolved'] as const

/**
 * The dialog's fields: `vCreateInterventionRequest` minus the learner and course (the panel sets them), with the
 * documented choices in place of its free strings.
 */
export const interventionFormSchema = v.object({
  ...v.pick(vCreateInterventionRequest, ['notes']).entries,
  intervention_type: v.picklist(INTERVENTION_TYPES),
  status: v.picklist(INTERVENTION_STATUSES),
})
export type InterventionForm = v.InferOutput<typeof interventionFormSchema>

export const isInterventionType = (value: string): value is (typeof INTERVENTION_TYPES)[number] =>
  v.is(v.picklist(INTERVENTION_TYPES), value)

export const isInterventionStatus = (value: string): value is (typeof INTERVENTION_STATUSES)[number] =>
  v.is(v.picklist(INTERVENTION_STATUSES), value)
