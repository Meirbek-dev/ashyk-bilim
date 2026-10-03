import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AssessmentId, CourseId } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { publishAllOptions } from '../mutations'

type PublishAllProps = { assessmentId: AssessmentId; courseId: CourseId; held: number }

/** Releases every held grade of the assessment (B-GRD-07): asks with the count, then reports what was left. */
export function PublishAll({ assessmentId, courseId, held }: PublishAllProps) {
  const [open, setOpen] = useState(false)
  const publish = useMutation(publishAllOptions({ kind: 'assessment', id: assessmentId }, courseId))
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
        publish.mutate(
          { path: { assessment_id: assessmentId } },
          {
            onSuccess: summary => {
              setOpen(false)
              toast.add({
                title: m.grading_publish_all_done({
                  published: formatNumber(summary.published_count),
                  pending: formatNumber(summary.needs_grading_count),
                }),
              })
            },
          },
        )
      }
    />
  )
}
