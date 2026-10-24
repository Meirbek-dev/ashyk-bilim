import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { UserProfile } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'

import { hasCode } from '../model/settings'
import { deleteAccountOptions } from '../queries'
import { PlainSection } from './plain-section'

// The password, or the username a Google-only account types; checked by the server and here.
const vConfirm = v.object({ password: v.string(), username: v.string() })

/**
 * Self-service deletion (B-SET-23): one dialog asks for the password (a Google-only account types its username).
 * After it the session is gone: a full load of `/` shows the signed-out landing.
 */
export function DeleteAccountSection({ profile }: { profile: UserProfile }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteAccountOptions())
  const navigate = useNavigate()
  const form = useAppForm(vConfirm, {
    defaultValues: { password: '', username: '' },
    onSubmit: async ({ password, username }) => {
      if (!profile.has_password && username.trim() !== profile.username) {
        form.setFieldMeta('username', meta => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: m.settings_delete_mismatch({ username: profile.username }) },
        }))
        return
      }
      try {
        await remove.mutateAsync({ body: profile.has_password ? { password } : {} })
        await navigate({ href: '/', reloadDocument: true })
      } catch (error) {
        if (!hasCode(error, 'invalid-credentials')) throw error
        form.setFieldMeta('password', meta => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: m.settings_current_password_wrong() },
        }))
      }
    },
  })
  return (
    <PlainSection title={m.settings_delete_title()} description={m.settings_delete_hint()}>
      <div>
        <FormDialog
          open={open}
          onOpenChange={next => {
            setOpen(next)
            if (!next) {
              form.reset()
              remove.reset()
            }
          }}
          trigger={<Button variant="destructive">{m.settings_delete_button()}</Button>}
          title={m.settings_delete_dialog_title()}
          submitLabel={m.settings_delete_submit()}
          onSubmit={() => form.handleSubmit()}
          pending={remove.isPending}
          error={hasCode(remove.error, 'invalid-credentials') ? null : remove.error}
        >
          <p className="text-sm text-muted-foreground">{m.settings_delete_hint()}</p>
          {profile.has_password ? (
            <form.AppField name="password">
              {field => (
                <field.TextField
                  label={m.settings_field_current_password()}
                  description={m.settings_delete_password()}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </form.AppField>
          ) : (
            <form.AppField name="username">
              {field => (
                <field.TextField
                  label={m.settings_field_username()}
                  description={m.settings_delete_google({ username: profile.username })}
                  autoComplete="off"
                  required
                />
              )}
            </form.AppField>
          )}
        </FormDialog>
      </div>
    </PlainSection>
  )
}
