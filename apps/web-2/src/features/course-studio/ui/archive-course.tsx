import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { archivePreviewOptions, lifecycleOptions } from '../queries'

/** "Archive": the confirmation names what archiving leaves behind, from the server's preview (UX-124). */
export function ArchiveCourse({ course }: { course: Course }) {
  const [open, setOpen] = useState(false)
  const { data: preview } = useSuspenseQuery(archivePreviewOptions(course.id))
  const lifecycle = useMutation(lifecycleOptions(useQueryClient(), course.id))
  const confirm = () =>
    lifecycle.mutate(
      { path: { course_id: course.id }, body: { action: 'archive' } },
      {
        onSuccess: () => {
          setOpen(false)
          toast(m.studio_archived())
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) lifecycle.reset()
      }}
      trigger={<Button variant="destructive">{m.studio_archive()}</Button>}
      title={m.studio_archive_confirm_title({ name: course.name })}
      consequence={m.studio_archive_consequence({
        enrolled: formatNumber(preview.learners_enrolled),
        inProgress: formatNumber(preview.learners_in_progress),
        ungraded: formatNumber(preview.ungraded_submissions),
        attempts: formatNumber(preview.open_attempts),
      })}
      confirmLabel={m.studio_archive()}
      onConfirm={confirm}
      pending={lifecycle.isPending}
      error={lifecycle.error}
    />
  )
}
