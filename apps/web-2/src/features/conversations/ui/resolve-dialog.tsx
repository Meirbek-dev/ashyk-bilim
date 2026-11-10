import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import * as v from 'valibot'
import { m } from '#/paraglide/messages'
import type { MessageReport } from '#/shared/api/gen/types.gen'
import { vResolveReportRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'
import { resolveOptions } from '../queries'

const vResolve = v.object({ ...vResolveReportRequest.entries, ban: v.boolean() })

export function ResolveDialog({ report }: { report: MessageReport }) {
  const [open, setOpen] = useState(false)
  const resolve = useMutation(resolveOptions(report.id))
  const form = useAppForm(vResolve, {
    defaultValues: { resolution: '', ban: false },
    onSubmit: ({ resolution, ban }) =>
      resolve.mutateAsync(
        { path: { report_id: report.id }, body: { resolution: resolution.trim(), ban } },
        {
          onSuccess: () => {
            setOpen(false)
            form.reset()
            toast.add({ title: m.conversations_resolved_toast() })
          },
        },
      ),
  })
  return (
    <FormDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) {
          form.reset()
          resolve.reset()
        }
      }}
      trigger={<Button>{m.conversations_resolve()}</Button>}
      title={m.conversations_resolve_title()}
      submitLabel={m.conversations_resolve()}
      onSubmit={() => form.handleSubmit()}
      pending={resolve.isPending}
      error={resolve.error}
    >
      <form.AppField name="resolution">
        {field => (
          <field.TextareaField
            label={m.conversations_resolution_label()}
            description={m.conversations_resolution_hint()}
            required
          />
        )}
      </form.AppField>
      {report.author_banned ? null : (
        <form.AppField name="ban">{field => <field.CheckboxField label={m.conversations_ban_label()} />}</form.AppField>
      )}
    </FormDialog>
  )
}
