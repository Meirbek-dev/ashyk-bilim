import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Usergroup } from '#/shared/api/gen/types.gen'
import { vUpdateUsergroupRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { updateGroupOptions } from '../queries'

/** The group's one edit place (`update`): name and description; the answer replaces the cached group. */
export function GroupEditSection({ group }: { group: Usergroup }) {
  const update = useMutation(updateGroupOptions(useQueryClient(), group.id))
  // Captured once: the cache write after saving must not reset what the user typed.
  const [defaultValues] = useState(() => ({ name: group.name, description: group.description }))
  const form = useAppForm(vUpdateUsergroupRequest, {
    defaultValues,
    onSubmit: body =>
      update.mutateAsync(
        { path: { group_id: group.id }, body },
        { onSuccess: () => toast.add({ title: m.admin_saved() }) },
      ),
  })
  return (
    <SettingsSection
      title={m.admin_section_general()}
      description={m.admin_group_edit_section_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="name">{field => <field.TextField label={m.admin_field_name()} required />}</form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.admin_field_description()} />}
      </form.AppField>
    </SettingsSection>
  )
}
