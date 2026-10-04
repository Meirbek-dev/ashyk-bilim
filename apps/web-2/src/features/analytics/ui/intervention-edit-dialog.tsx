import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { Intervention } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import {
  editableStatuses,
  INTERVENTION_OUTCOMES,
  type InterventionEdit,
  interventionEditSchema,
} from '../model/interventions'
import { interventionVersion, reloadInterventions, updateInterventionOptions } from '../queries'
import { interventionOutcomeLabels, interventionStatusLabels } from './labels'

const isStale = (error: unknown) => error instanceof ApiError && error.status === 412
const statusOptions = (allowed: readonly string[]) =>
  editableStatuses(allowed).map(value => ({ value, label: interventionStatusLabels[value]() }))
const outcomeOptions = () => [
  { value: '', label: m.analytics_outcome_none() },
  ...INTERVENTION_OUTCOMES.map(value => ({ value, label: interventionOutcomeLabels[value]() })),
]

/**
 * Changes one intervention (B-ANL-26): status, outcome and notes, sent with `If-Match`. A 412 opens the conflict
 * dialog; the retry reads the history again and sends the form on the current version.
 */
export function InterventionEditDialog({ item }: { item: Intervention }) {
  const queryClient = useQueryClient()
  const update = useMutation(updateInterventionOptions(queryClient, item.user_id, item.course_id))
  const [open, setOpen] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [defaultValues] = useState<InterventionEdit>(() => ({
    status: item.status,
    outcome_code: item.outcome_code ?? '',
    notes: item.notes ?? '',
  }))
  const form = useAppForm(interventionEditSchema, {
    defaultValues,
    onSubmit: ({ status, outcome_code, notes }) =>
      update.mutateAsync(
        {
          path: { intervention_id: item.id },
          body: { status, outcome_code: outcome_code || null, notes: notes.trim() || null },
          headers: { 'If-Match': interventionVersion(queryClient, item) },
        },
        {
          onSuccess: () => {
            setOpen(false)
            toast.add({ title: m.analytics_intervention_saved() })
          },
          onError: error => setConflict(isStale(error)),
        },
      ),
  })
  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) update.reset()
        }}
        trigger={
          <Button variant="outline" size="sm">
            {m.analytics_intervention_edit()}
          </Button>
        }
        title={m.analytics_intervention_edit()}
        submitLabel={m.ui_save()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="status">
          {field => (
            <field.SelectField
              label={m.analytics_intervention_status()}
              options={statusOptions(item.allowed_actions)}
            />
          )}
        </form.AppField>
        <form.AppField name="outcome_code">
          {field => <field.SelectField label={m.analytics_intervention_outcome()} options={outcomeOptions()} />}
        </form.AppField>
        <form.AppField name="notes">
          {field => <field.TextareaField label={m.analytics_intervention_notes()} />}
        </form.AppField>
      </FormDialog>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onRetry={() =>
          void reloadInterventions(queryClient, item.user_id, item.course_id).then(() => {
            setConflict(false)
            return form.handleSubmit()
          })
        }
        pending={update.isPending}
      />
    </>
  )
}
