import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale, permissionsFormSchema, refusedGrants, refusesGrants } from '../model/admin'
import { roleVersion, roleWrite, setPermissionsOptions } from '../queries'
import { GrantRows } from './grant-rows'
import { type BaseVersion, useIfMatch } from './use-if-match'

/**
 * A custom role's grant set (`set_permissions`): one row per grant (resource, action, scope picked from the catalog),
 * replaced whole, saved with `If-Match` (a 412 opens the conflict dialog). A 422 names the refused grants
 * (`permissions[i]`): those rows are marked.
 */
export function RolePermissionsSection({ role, base }: { role: Role; base: BaseVersion }) {
  const queryClient = useQueryClient()
  const save = useMutation(setPermissionsOptions(queryClient))
  const write = useIfMatch(
    base,
    (permissions: string[], version: number) =>
      save.mutateAsync(
        { path: { slug: role.slug }, body: { permissions }, ...roleWrite(version) },
        { onSuccess: () => toast.add({ title: m.admin_saved() }) },
      ),
    () => roleVersion(queryClient, role.slug),
  )
  const [defaultValues] = useState(() => ({ permissions: [...role.permissions] }))
  const form = useAppForm(permissionsFormSchema, {
    defaultValues,
    leaveGuard: true,
    // Two rows that say the same are one grant.
    onSubmit: ({ permissions }) => write.save([...new Set(permissions)]),
  })
  // The server numbers the refused grants in the list it was sent; the rows are marked by the grant itself.
  const refused = refusedGrants(save.error).flatMap(at => save.variables?.body.permissions[at] ?? [])
  return (
    <>
      <SettingsSection
        title={m.admin_role_permissions()}
        description={m.admin_role_permissions_section_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={save.isPending}
        error={isStale(save.error) || refusesGrants(save.error) ? null : save.error}
      >
        <form.AppField name="permissions">
          {field => (
            <GrantRows
              grants={field.state.value}
              refused={refused}
              disabled={save.isPending}
              onChange={grants => field.handleChange(grants)}
            />
          )}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog(() => form.handleSubmit())} />
    </>
  )
}
