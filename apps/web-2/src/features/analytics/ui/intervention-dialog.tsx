import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, UserId } from '#/shared/api/gen/types.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import {
  INTERVENTION_STATUSES,
  INTERVENTION_TYPES,
  type InterventionForm,
  interventionFormSchema,
} from '../model/interventions'
import { createInterventionOptions } from '../queries'
import { interventionStatusLabels, interventionTypeLabels } from './labels'

const defaultValues: InterventionForm = { intervention_type: 'message_sent', status: 'completed', notes: '' }

/**
 * "New intervention" for one learner in one course. The key survives a resubmit that got no answer, so the server
 * replays instead of recording twice (spec 7.6).
 */
export function InterventionDialog({ learnerId, courseId }: { learnerId: UserId; courseId: CourseId }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const create = useMutation(createInterventionOptions(queryClient, learnerId, courseId))
  const idempotency = useIdempotencyKey()
  const form = useAppForm(interventionFormSchema, {
    defaultValues,
    onSubmit: ({ notes, ...value }) =>
      create.mutateAsync(
        {
          body: { ...value, notes: notes?.trim() || undefined, user_id: learnerId, course_id: courseId },
          headers: { 'Idempotency-Key': idempotency.key },
        },
        {
          onSuccess: () => {
            idempotency.settle()
            setOpen(false)
            form.reset()
            toast.add({ title: m.analytics_intervention_created() })
          },
          onError: error => idempotency.settle(error),
        },
      ),
  })
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      form.reset()
      create.reset()
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      trigger={<Button variant="outline">{m.analytics_intervention_new()}</Button>}
      title={m.analytics_intervention_new()}
      submitLabel={m.analytics_intervention_submit()}
      onSubmit={() => form.handleSubmit()}
      pending={create.isPending}
      error={create.error}
    >
      <form.AppField name="intervention_type">
        {field => (
          <field.SelectField
            label={m.analytics_col_type()}
            options={INTERVENTION_TYPES.map(value => ({ value, label: interventionTypeLabels[value]() }))}
          />
        )}
      </form.AppField>
      <form.AppField name="status">
        {field => (
          <field.SelectField
            label={m.analytics_intervention_status()}
            options={INTERVENTION_STATUSES.map(value => ({ value, label: interventionStatusLabels[value]() }))}
          />
        )}
      </form.AppField>
      <form.AppField name="notes">
        {field => <field.TextareaField label={m.analytics_intervention_notes()} />}
      </form.AppField>
    </FormDialog>
  )
}
