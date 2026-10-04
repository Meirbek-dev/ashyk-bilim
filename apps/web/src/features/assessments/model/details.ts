import * as v from 'valibot'

import type { AssessmentDetail, GradingType, UpdateAssessmentRequest } from '#/shared/api/gen/types.gen'
import { vGradingType, vUpdateAssessmentRequest } from '#/shared/api/gen/valibot.gen'

// "Basics": description, weight and scale. The title is the activity's name (server UX-112): the name section edits it.

export type DetailsForm = { description: string; weight: string; grading_type: GradingType }

const { description, weight } = vUpdateAssessmentRequest.entries

/** Weight as typed text within the contract's range. */
const weightText = v.pipe(
  v.string(),
  v.check(text => text.trim() !== '' && v.is(weight, Number(text.replace(',', '.')))),
)

export const detailsFormSchema = v.object({
  description: description.wrapped,
  weight: weightText,
  grading_type: vGradingType,
})

export const detailsForm = (assessment: AssessmentDetail): DetailsForm => ({
  description: assessment.description,
  weight: String(assessment.weight),
  grading_type: assessment.grading_type,
})

export const detailsBody = (form: DetailsForm): UpdateAssessmentRequest => ({
  description: form.description,
  weight: Number(form.weight.replace(',', '.')),
  grading_type: form.grading_type,
})
