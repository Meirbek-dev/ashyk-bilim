import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Role, UpdateRoleRequest } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale, roleEditSchema } from '../model/admin'
import { roleDescription, roleName } from '../model/roles'
import { roleVersion, roleWrite, updateRoleOptions } from '../queries'
import { type BaseVersion, useIfMatch } from './use-if-match'

/**
 * Name, description and priority of a custom role (`update`), saved with `If-Match`; a 412 opens the conflict dialog.
 * The answered role replaces the cached one.
 */
export function RoleEditSection({ role, base }: { role: Role; base: BaseVersion }) {
  const queryClient = useQueryClient()
  const update = useMutation(updateRoleOptions(queryClient))
  const write = useIfMatch(
    base,
    (body: UpdateRoleRequest, version: number) =>
      update.mutateAsync(
        { path: { slug: role.slug }, body, ...roleWrite(version) },
        { onSuccess: () => toast.add({ title: m.admin_saved() }) },
      ),
    () => roleVersion(queryClient, role.slug),
  )
  // Captured once: a later cache write must not reset what the user typed.
  const [defaultValues] = useState(() => ({
    display_name: roleName(role),
    description: roleDescription(role),
    priority: String(role.priority),
  }))
  const form = useAppForm(roleEditSchema, {
    defaultValues,
    onSubmit: ({ priority, ...text }) => write.save({ ...text, priority: Number(priority) }),
  })
  return (
    <>
      <SettingsSection
        title={m.admin_section_general()}
        description={m.admin_role_edit_section_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
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
      <ConflictDialog {...write.dialog} />
    </>
  )
}
