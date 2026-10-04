import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { UpdateUsergroupRequest, Usergroup } from '#/shared/api/gen/types.gen'
import { vUpdateUsergroupRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { groupVersion, updateGroupOptions } from '../group-queries'
import { isStale } from '../model/admin'
import { useIfMatch } from './use-if-match'

/**
 * The group's one edit place (`update`): name and description, saved with `If-Match` (a 412 opens the conflict
 * dialog); the answer replaces the cached group.
 */
export function GroupEditSection({ group }: { group: Usergroup }) {
  const queryClient = useQueryClient()
  const update = useMutation(updateGroupOptions(queryClient, group.id))
  const write = useIfMatch(
    useState(group.version),
    (body: UpdateUsergroupRequest, version: number) =>
      update.mutateAsync(
        { path: { group_id: group.id }, body, headers: { 'If-Match': version } },
        { onSuccess: () => toast.add({ title: m.admin_saved() }) },
      ),
    () => groupVersion(queryClient, group.id),
  )
  // Captured once: the cache write after saving must not reset what the user typed.
  const [defaultValues] = useState(() => ({ name: group.name, description: group.description }))
  const form = useAppForm(vUpdateUsergroupRequest, {
    defaultValues,
    onSubmit: body => write.save(body),
  })
  return (
    <>
      <SettingsSection
        title={m.admin_section_general()}
        description={m.admin_group_edit_section_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <form.AppField name="name">{field => <field.TextField label={m.admin_field_name()} required />}</form.AppField>
        <form.AppField name="description">
          {field => <field.TextareaField label={m.admin_field_description()} />}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
    </>
  )
}
