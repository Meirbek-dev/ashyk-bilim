import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import * as v from 'valibot'

import { MarkdownEditor } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { FileSubmission } from '#/shared/api/gen/types.gen'
import { vConfigPatch } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Skeleton } from '#/shared/ui/skeleton'
import { toast } from '#/shared/ui/toast'

import { updateTaskOptions } from '../queries'

const instructionsSchema = v.pick(vConfigPatch, ['instructions'])

/** The task's instructions in markdown with their own Save (B-FSB-14); a published task refuses blank ones (409). */
export function InstructionsSection({ task }: { task: FileSubmission }) {
  const update = useMutation(updateTaskOptions(useQueryClient(), task.activity_id))
  // Captured once: the editor owns its text while the teacher types.
  const [defaultValues] = useState(() => ({ instructions: task.instructions }))
  const form = useAppForm(instructionsSchema, {
    defaultValues,
    onSubmit: body =>
      update.mutateAsync(
        { path: { file_submission_id: task.id }, body },
        { onSuccess: () => toast.add({ title: m.submission_saved() }) },
      ),
  })
  return (
    <SettingsSection
      title={m.submission_instructions()}
      description={m.submission_instructions_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="instructions">
        {field => (
          <Suspense fallback={<Skeleton className="h-row w-full" />}>
            <MarkdownEditor
              label={m.submission_instructions()}
              value={field.state.value ?? ''}
              onChange={field.handleChange}
            />
          </Suspense>
        )}
      </form.AppField>
    </SettingsSection>
  )
}
