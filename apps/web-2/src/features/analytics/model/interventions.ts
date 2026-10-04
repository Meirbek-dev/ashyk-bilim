import * as v from 'valibot'

import {
  vCreateInterventionRequest,
  vInterventionOutcome,
  vInterventionStatus,
  vInterventionType,
} from '#/shared/api/gen/valibot.gen'

export const INTERVENTION_TYPES = vInterventionType.options
export const INTERVENTION_STATUSES = vInterventionStatus.options
export const INTERVENTION_OUTCOMES = vInterventionOutcome.options

/** The edit dialog (B-ANL-26): status, outcome ('' = none yet) and notes. */
export const interventionEditSchema = v.object({
  status: vInterventionStatus,
  outcome_code: v.union([v.literal(''), vInterventionOutcome]),
  notes: v.string(),
})
export type InterventionEdit = v.InferOutput<typeof interventionEditSchema>

/** The statuses the caller may pick: `resolved` only with the `resolve` action. */
export const editableStatuses = (allowed: readonly string[]) =>
  INTERVENTION_STATUSES.filter(status => status !== 'resolved' || allowed.includes('resolve'))

/**
 * The dialog's fields: `vCreateInterventionRequest` minus the learner and course (the panel sets them), with the
 * status required (the form always has one chosen).
 */
export const interventionFormSchema = v.object({
  ...v.pick(vCreateInterventionRequest, ['notes', 'intervention_type']).entries,
  status: vInterventionStatus,
})
export type InterventionForm = v.InferOutput<typeof interventionFormSchema>
