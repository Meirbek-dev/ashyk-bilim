import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { roleEditSchema } from '../model/admin'
import { roleDescription, roleName } from '../model/roles'
import { updateRoleOptions } from '../queries'

/** Name, description and priority of a custom role (`update`); the cache takes the change (the write answers 204). */
export function RoleEditSection({ role }: { role: Role }) {
  const update = useMutation(updateRoleOptions(useQueryClient()))
  // Captured once: a later cache write must not reset what the user typed.
  const [defaultValues] = useState(() => ({
    display_name: roleName(role),
    description: roleDescription(role),
    priority: String(role.priority),
  }))
  const form = useAppForm(roleEditSchema, {
    defaultValues,
    onSubmit: ({ priority, ...text }) =>
      update.mutateAsync(
        { path: { slug: role.slug }, body: { ...text, priority: Number(priority) } },
        { onSuccess: () => toast(m.admin_saved()) },
      ),
  })
  return (
    <SettingsSection
      title={m.admin_section_general()}
      description={m.admin_role_edit_section_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="display_name">
        {field => <field.TextField label={m.admin_field_name()} required />}
      </form.AppField>
      <form.AppField name="description">
        {field => <field.TextareaField label={m.admin_field_description()} />}
      </form.AppField>
      <form.AppField name="priority">
        {field => (
          <field.TextField
            label={m.admin_role_priority()}
            description={m.admin_role_priority_hint()}
            inputMode="numeric"
            required
          />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
