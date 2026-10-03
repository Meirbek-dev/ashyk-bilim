import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { permissionLines, permissionsFormSchema } from '../model/admin'
import { setPermissionsOptions } from '../queries'

/**
 * A custom role's grant set (`set_permissions`), one per line, replaced whole. The server parses each string; a bad
 * one is its 422 under the field. The web never reads the strings (R-06).
 */
export function RolePermissionsSection({ role }: { role: Role }) {
  const save = useMutation(setPermissionsOptions(useQueryClient()))
  const [defaultValues] = useState(() => ({ permissions: role.permissions.join('\n') }))
  const form = useAppForm(permissionsFormSchema, {
    defaultValues,
    onSubmit: ({ permissions }) =>
      save.mutateAsync(
        { path: { slug: role.slug }, body: { permissions: permissionLines(permissions) } },
        { onSuccess: () => toast(m.admin_saved()) },
      ),
  })
  return (
    <SettingsSection
      title={m.admin_role_permissions()}
      description={m.admin_role_permissions_section_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={save.isPending}
      error={save.error}
    >
      <form.AppField name="permissions">
        {field => (
          <field.TextareaField label={m.admin_role_permissions()} description={m.admin_role_permissions_hint()} />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
