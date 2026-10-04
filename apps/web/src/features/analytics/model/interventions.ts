import * as v from 'valibot'

import { vCreateInterventionRequest, vInterventionStatus, vInterventionType } from '#/shared/api/gen/valibot.gen'

export const INTERVENTION_TYPES = vInterventionType.options
export const INTERVENTION_STATUSES = vInterventionStatus.options

/**
 * The dialog's fields: `vCreateInterventionRequest` minus the learner and course (the panel sets them), with the
 * status required (the form always has one chosen).
 */
export const interventionFormSchema = v.object({
  ...v.pick(vCreateInterventionRequest, ['notes', 'intervention_type']).entries,
  status: vInterventionStatus,
})
export type InterventionForm = v.InferOutput<typeof interventionFormSchema>
