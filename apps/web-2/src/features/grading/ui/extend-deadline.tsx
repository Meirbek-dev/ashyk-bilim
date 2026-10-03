import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { AssessmentId, CourseId } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { formatNumber, fromDateTimeInput } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { extensionTargets, type QueueRow } from '../model/queue'
import { extendOptions } from '../mutations'

// Field names follow the request, so the server's 422 (a past date) lands under the date field.
const extendSchema = v.object({
  new_due_at_unix: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  reason: v.string(),
})

type ExtendDeadlineProps = { assessmentId: AssessmentId; courseId: CourseId; rows: readonly QueueRow[] }

/** "Extend deadline" for the selected course members (B-GRD-09): a date in the platform zone and a reason. */
export function ExtendDeadline({ assessmentId, courseId, rows }: ExtendDeadlineProps) {
  const [open, setOpen] = useState(false)
  const extend = useMutation(extendOptions({ kind: 'assessment', id: assessmentId }, courseId))
  const { ids, skipped } = extensionTargets(rows)
  const form = useAppForm(extendSchema, {
    defaultValues: { new_due_at_unix: '', reason: '' },
    onSubmit: ({ new_due_at_unix: due, reason }) =>
      extend.mutateAsync(
        {
          path: { assessment_id: assessmentId },
          body: { new_due_at_unix: fromDateTimeInput(due), user_ids: ids, ...(reason.trim() ? { reason } : {}) },
        },
        {
          onSuccess: () => {
            setOpen(false)
            form.reset()
            toast.add({ title: m.grading_extend_done() })
          },
        },
      ),
  })
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" disabled={ids.length === 0}>
          {m.grading_extend()}
        </Button>
      }
      title={m.grading_extend()}
      submitLabel={m.grading_extend()}
      onSubmit={() => form.handleSubmit()}
      pending={extend.isPending}
      error={extend.error}
    >
      <p className="text-sm text-muted-foreground">{m.grading_extend_text({ count: formatNumber(ids.length) })}</p>
      {skipped.length > 0 ? (
        <p className="text-sm text-muted-foreground">{m.grading_extend_skipped({ names: skipped.join(', ') })}</p>
      ) : null}
      <form.AppField name="new_due_at_unix">
        {field => <field.TextField label={m.grading_extend_due()} type="datetime-local" required />}
      </form.AppField>
      <form.AppField name="reason">{field => <field.TextareaField label={m.grading_extend_reason()} />}</form.AppField>
    </FormDialog>
  )
}
