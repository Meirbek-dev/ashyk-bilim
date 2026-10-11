import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Role } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale, permissionLines, permissionsFormSchema, refusedLines, refusesGrants } from '../model/admin'
import { roleVersion, roleWrite, setPermissionsOptions } from '../queries'
import { type BaseVersion, useIfMatch } from './use-if-match'

/** Selects a line of the permissions textarea (1-based): the refused grant the author fixes next. */
function selectLine(text: string, line: number) {
  const field = document.querySelector<HTMLTextAreaElement>('textarea[name="permissions"]')
  const lines = text.split('\n')
  const start = lines.slice(0, line - 1).reduce((sum, before) => sum + before.length + 1, 0)
  const end = start + (lines[line - 1]?.length ?? 0)
  field?.focus()
  field?.setSelectionRange(start, end)
}

/**
 * A custom role's grant set (`set_permissions`), one per line, replaced whole, saved with `If-Match` (a 412 opens the
 * conflict dialog). The server parses each string; a 422 names the refused ones (`permissions[i]`): the field says
 * which lines and the first one is selected in the textarea. The web never reads the strings (R-06).
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
  const [defaultValues] = useState(() => ({ permissions: role.permissions.join('\n') }))
  const form = useAppForm(permissionsFormSchema, {
    defaultValues,
    leaveGuard: true,
    onSubmit: ({ permissions }) =>
      write.save(permissionLines(permissions)).catch((error: unknown) => {
        const lines = refusedLines(permissions, error)
        if (lines.length > 0) {
          const message = m.admin_role_permissions_refused({ lines: lines.join(', ') })
          form.setFieldMeta('permissions', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: message } }))
          selectLine(permissions, lines[0] ?? 1)
        }
        throw error
      }),
  })
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
            <field.TextareaField label={m.admin_role_permissions()} description={m.admin_role_permissions_hint()} />
          )}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog(() => form.handleSubmit())} />
    </>
  )
}
