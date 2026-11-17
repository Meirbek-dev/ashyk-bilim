import * as v from 'valibot'

import type { AssessmentDetail, GradingType, UpdateAssessmentRequest } from '#/shared/api/gen/types.gen'
import { vGradingType, vUpdateAssessmentRequest } from '#/shared/api/gen/valibot.gen'

// "Basics": description, weight and scale. The title is the activity's name (server UX-112): the name section edits it.

export type DetailsForm = { description: string; weight: string; grading_kind: GradingType }

const { description, weight } = vUpdateAssessmentRequest.entries

/** Weight as typed text within the contract's range. */
const weightText = v.pipe(
  v.string(),
  v.check(text => text.trim() !== '' && v.is(weight, Number(text.replace(',', '.')))),
)

export const detailsFormSchema = v.object({
  description: description.wrapped,
  weight: weightText,
  grading_kind: vGradingType,
})

export const detailsForm = (assessment: AssessmentDetail): DetailsForm => ({
  description: assessment.description,
  weight: String(assessment.weight),
  grading_kind: assessment.grading_kind,
})

export const detailsBody = (form: DetailsForm): UpdateAssessmentRequest => ({
  description: form.description,
  weight: Number(form.weight.replace(',', '.')),
  grading_kind: form.grading_kind,
})
