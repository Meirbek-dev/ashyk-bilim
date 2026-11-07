import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { FieldDescription, FieldLegend, FieldSet } from '#/shared/ui/field'

import { filesForm, filesPatch, filesSchema } from '../model/config'
import { TYPE_GROUP_KEYS } from '../model/types'
import { typeGroupLabels } from './labels'
import { useTaskSave } from './use-task-save'

/** How many files, how large and which kinds (B-FSB-16); out-of-range numbers come back under their fields. */
export function FilesSection({ task }: { task: FileSubmission }) {
  const write = useTaskSave(task)
  const [defaultValues] = useState(() => filesForm(task))
  const form = useAppForm(filesSchema, {
    defaultValues,
    leaveGuard: true,
    onSubmit: values => write.save(filesPatch(values, task)),
  })
  return (
    <>
      <SettingsSection
        title={m.submission_files_title()}
        description={m.submission_files_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={write.pending}
        error={write.error}
      >
        {/* Two short numbers side by side: a count does not need a field as wide as a sentence. */}
        <div className="grid gap-4 @xl:grid-cols-2 @xl:items-start">
          <form.AppField name="max_files">
            {field => <field.TextField label={m.submission_field_max_files()} inputMode="numeric" required />}
          </form.AppField>
          <form.AppField name="max_file_size_mb">
            {field => (
              <field.TextField
                label={m.submission_field_max_size()}
                description={m.submission_max_size_hint()}
                inputMode="numeric"
              />
            )}
          </form.AppField>
        </div>
        <FieldSet>
          <FieldLegend variant="label">{m.submission_field_types()}</FieldLegend>
          <FieldDescription>{m.submission_field_types_hint()}</FieldDescription>
          <div className="grid gap-x-4 gap-y-3 @xl:grid-cols-2">
            {TYPE_GROUP_KEYS.map(group => (
              <form.AppField key={group} name={`types.${group}`}>
                {field => <field.CheckboxField label={typeGroupLabels[group]()} />}
              </form.AppField>
            ))}
          </div>
        </FieldSet>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
    </>
  )
}
