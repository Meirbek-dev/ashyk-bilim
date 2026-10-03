import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { IconButton } from '#/shared/components/icon-button'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { newCriterion, rubricForm, rubricPatch, rubricSchema } from '../model/config'
import { updateTaskOptions } from '../queries'

/** Rubric criteria: a name and the most points each; added and removed here, saved together (B-FSB-15). */
export function RubricSection({ task }: { task: FileSubmission }) {
  const update = useMutation(updateTaskOptions(useQueryClient(), task.activity_id))
  const [defaultValues] = useState(() => rubricForm(task.rubric))
  const form = useAppForm(rubricSchema, {
    defaultValues,
    onSubmit: values =>
      update.mutateAsync(
        { path: { file_submission_id: task.id }, body: rubricPatch(values) },
        { onSuccess: () => toast.add({ title: m.submission_saved() }) },
      ),
  })
  return (
    <SettingsSection
      title={m.submission_rubric_title()}
      description={m.submission_rubric_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="criteria" mode="array">
        {list => (
          <div className="flex flex-col gap-4">
            {list.state.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.submission_rubric_empty()}</p>
            ) : null}
            {list.state.value.map((criterion, index) => (
              <div key={criterion.criterion_id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <form.AppField name={`criteria[${index}].label`}>
                    {field => <field.TextField label={m.submission_criterion_name({ number: index + 1 })} required />}
                  </form.AppField>
                </div>
                <div className="w-32">
                  <form.AppField name={`criteria[${index}].max_score`}>
                    {field => <field.TextField label={m.submission_criterion_max()} inputMode="decimal" required />}
                  </form.AppField>
                </div>
                <IconButton
                  label={m.submission_criterion_remove({ number: index + 1 })}
                  icon={<X aria-hidden />}
                  onClick={() => list.removeValue(index)}
                />
              </div>
            ))}
            <div>
              <Button type="button" variant="outline" onClick={() => list.pushValue(newCriterion())}>
                <Plus data-icon="inline-start" aria-hidden />
                {m.submission_criterion_add()}
              </Button>
            </div>
          </div>
        )}
      </form.AppField>
    </SettingsSection>
  )
}
