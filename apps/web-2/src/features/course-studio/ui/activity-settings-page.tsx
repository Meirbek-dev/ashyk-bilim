import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { toast } from '#/shared/ui/toast'

import { activityOptions, updateActivityOptions } from '../curriculum-queries'
import { isStale } from '../model/course'
import { nameSchema } from '../model/studio'
import { LockableSection } from './lockable-section'

/**
 * `settings` of an activity: the fields of the activity record itself (its name). Deadlines and "required" live on
 * the assessment policy and the file-submission config (slices 5.1, 5.4). `lock`: why the name is read-only (a locked
 * assessment renames through its activity, B-ASM-28).
 */
export function ActivitySettingsPage({ lock = null }: { lock?: string | null }) {
  const { courseId, activityId } = useParams({
    from: '/_authed/teach/courses/$courseId_/activities/$activityId/settings',
  })
  const query = useSuspenseQuery(activityOptions(activityId))
  const update = useMutation(updateActivityOptions(useQueryClient(), courseId))
  const [conflict, setConflict] = useState(false)
  const [defaultValues] = useState(() => ({ name: query.data.name }))
  const request = (name: string, version: number) => ({
    path: { activity_id: activityId },
    body: { name },
    headers: { 'If-Match': version },
  })
  const callbacks = {
    onSuccess: () => {
      setConflict(false)
      toast.add({ title: m.studio_saved() })
    },
    onError: (error: unknown) => setConflict(isStale(error)),
  }
  const form = useAppForm(nameSchema, {
    defaultValues,
    onSubmit: ({ name }) => update.mutateAsync(request(name, query.data.version), callbacks),
  })
  const reloadAndRetry = async () => {
    const fresh = await query.refetch()
    if (fresh.data) update.mutate(request(form.state.values.name, fresh.data.version), callbacks)
  }
  return (
    <>
      <LockableSection
        lock={lock}
        title={m.platform_tab_settings()}
        description={m.studio_activity_settings_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending && !conflict}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="name">{field => <field.TextField label={m.studio_field_name()} required />}</form.AppField>
      </LockableSection>
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        onRetry={() => void reloadAndRetry()}
        pending={update.isPending || query.isFetching}
      />
    </>
  )
}
