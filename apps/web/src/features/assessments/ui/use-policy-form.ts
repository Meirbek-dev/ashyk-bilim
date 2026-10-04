import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { toast } from '#/shared/ui/toast'

import { policyBody, policyForm, policyFormSchema } from '../model/policy'
import { setPolicyOptions } from '../queries'
import { useVersion } from './use-version'

/** The "Rules" form: the whole policy block is replaced on save (fields the form does not show go back as stored). */
export function usePolicyForm(activityId: string, assessment: AssessmentDetail) {
  const save = useMutation(setPolicyOptions(useQueryClient(), activityId, assessment.id))
  const version = useVersion(activityId)
  // Captured once: the cache write after saving must not reset what the author typed.
  const [defaultValues] = useState(() => policyForm(assessment.policy))
  const form = useAppForm(policyFormSchema, {
    defaultValues,
    onSubmit: values =>
      save.mutateAsync(
        {
          path: { assessment_id: assessment.id },
          body: policyBody(values, assessment.policy, assessment.kind),
          headers: version.headers(),
        },
        { onSuccess: () => toast.add({ title: m.assessments_saved() }), onError: version.onError },
      ),
  })
  return { form, save, version }
}

export type PolicyFormApi = ReturnType<typeof usePolicyForm>['form']
