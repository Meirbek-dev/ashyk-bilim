import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail, Lifecycle } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { momentOf } from '../model/moment'
import { canMove } from '../model/publishing'
import { lifecycleOptions } from '../queries'

type LifecycleActionsProps = { activityId: string; title: string; assessment: AssessmentDetail }

/** The schedule field is named like the server's field, so a 422 (`in-past`) shows under it. */
const scheduleSchema = v.object({
  scheduled_at: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.check(value => momentOf(value) !== null),
  ),
})

const toasts: Record<Lifecycle, () => string> = {
  scheduled: m.assessments_toast_scheduled,
  draft: m.assessments_toast_restored,
  archived: m.assessments_toast_archived,
  published: m.assessments_toast_published,
}

/** Schedule, unschedule, archive and restore (publishing now is the header switch). */
export function LifecycleActions({ activityId, title, assessment }: LifecycleActionsProps) {
  const transition = useMutation(lifecycleOptions(useQueryClient(), activityId, assessment.course_id, assessment.id))
  const [archiving, setArchiving] = useState(false)
  const from = assessment.lifecycle
  const move = (to: Lifecycle, scheduledAt?: number) =>
    transition.mutateAsync(
      {
        path: { assessment_id: assessment.id },
        body: { to, ...(scheduledAt ? { scheduled_at_unix: scheduledAt } : {}) },
      },
      {
        onSuccess: () => {
          setArchiving(false)
          toast.add({
            title: from === 'scheduled' && to === 'draft' ? m.assessments_toast_unscheduled() : toasts[to](),
          })
        },
      },
    )
  const form = useAppForm(scheduleSchema, {
    defaultValues: { scheduled_at: '' },
    onSubmit: ({ scheduled_at }) => move('scheduled', momentOf(scheduled_at) ?? 0),
  })
  const run = (to: Lifecycle) => void move(to).catch(() => undefined)
  return (
    <div className="flex flex-col gap-3">
      {from === 'draft' ? (
        <form
          noValidate
          aria-label={m.assessments_schedule()}
          className="flex flex-wrap items-end gap-2"
          onSubmit={event => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppField name="scheduled_at">
            {field => <field.TextField label={m.assessments_schedule_at()} type="datetime-local" />}
          </form.AppField>
          <Button type="submit" variant="outline" disabled={transition.isPending}>
            {m.assessments_schedule()}
          </Button>
        </form>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {from === 'scheduled' ? (
          <Button variant="outline" disabled={transition.isPending} onClick={() => run('draft')}>
            {m.assessments_unschedule()}
          </Button>
        ) : null}
        {from === 'archived' ? (
          <Button variant="outline" disabled={transition.isPending} onClick={() => run('draft')}>
            {m.assessments_restore()}
          </Button>
        ) : null}
        {canMove(assessment, 'archived') ? (
          <ConfirmDialog
            open={archiving}
            onOpenChange={next => {
              setArchiving(next)
              if (!next) transition.reset()
            }}
            trigger={<Button variant="destructive">{m.assessments_archive()}</Button>}
            title={m.assessments_archive_title({ title })}
            consequence={m.assessments_archive_consequence()}
            confirmLabel={m.assessments_archive()}
            onConfirm={() => run('archived')}
            pending={transition.isPending}
            error={transition.error}
          />
        ) : null}
      </div>
      {transition.error && !archiving ? <ErrorAlert>{presentError(transition.error)}</ErrorAlert> : null}
    </div>
  )
}
