import { useMutation } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { useState } from 'react'
import { m } from '#/paraglide/messages'
import type { Message } from '#/shared/api/gen/types.gen'
import { vReportMessageRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { IconButton } from '#/shared/components/icon-button'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { toast } from '#/shared/ui/toast'
import { reportMessageOptions } from '../queries'

/** «Пожаловаться» on the other person's message: the reason goes to the platform admins, not to them. */
export function ReportMessage({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const report = useMutation(reportMessageOptions(message.conversation_id))
  const form = useAppForm(vReportMessageRequest, {
    defaultValues: { reason: '' },
    onSubmit: ({ reason }) =>
      report.mutateAsync(
        { path: { message_id: message.id }, body: { reason: reason.trim() } },
        {
          onSuccess: () => {
            setOpen(false)
            form.reset()
            toast.add({ title: m.conversations_reported_toast() })
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
          report.reset()
        }
      }}
      trigger={<IconButton label={m.conversations_report()} icon={<Flag aria-hidden />} />}
      title={m.conversations_report_title()}
      submitLabel={m.conversations_report_send()}
      onSubmit={() => form.handleSubmit()}
      pending={report.isPending}
      error={report.error}
    >
      <form.AppField name="reason">
        {field => (
          <field.TextareaField
            label={m.conversations_report_reason()}
            description={m.conversations_report_hint()}
            required
          />
        )}
      </form.AppField>
    </FormDialog>
  )
}
