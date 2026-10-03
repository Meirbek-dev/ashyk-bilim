import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { publishAllOptions, type PublishOutcome } from '../mutations'
import type { Work } from '../queries'

type PublishAllProps = { work: Work; courseId: CourseId; held: number }

const doneText = ({ published, skipped, pending }: PublishOutcome) =>
  pending === null
    ? m.grading_publish_files_done({ published: formatNumber(published), skipped: formatNumber(skipped) })
    : m.grading_publish_all_done({ published: formatNumber(published), pending: formatNumber(pending) })

/** Releases every held grade of the work (B-GRD-07, B-GRD-25): asks with the count, then reports the outcome. */
export function PublishAll({ work, courseId, held }: PublishAllProps) {
  const [open, setOpen] = useState(false)
  const publish = useMutation(publishAllOptions(work, courseId))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button disabled={held === 0}>{m.grading_publish_all()}</Button>}
      title={m.grading_publish_all_title()}
      consequence={m.grading_publish_all_text({ count: formatNumber(held) })}
      confirmLabel={m.grading_publish()}
      pending={publish.isPending}
      error={publish.error}
      onConfirm={() =>
        publish.mutate(undefined, {
          onSuccess: outcome => {
            setOpen(false)
            toast.add({ title: doneText(outcome) })
          },
        })
      }
    />
  )
}
