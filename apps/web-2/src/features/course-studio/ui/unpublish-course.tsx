import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { lifecycleOptions } from '../queries'

/** "Unpublish" says that learners lose access before it acts (UX-200). */
export function UnpublishCourse({ course }: { course: Course }) {
  const [open, setOpen] = useState(false)
  const lifecycle = useMutation(lifecycleOptions(useQueryClient(), course.id))
  const confirm = () =>
    lifecycle.mutate(
      { path: { id: course.id }, body: { action: 'unpublish' } },
      {
        onSuccess: () => {
          setOpen(false)
          toast(m.studio_unpublished())
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
      trigger={<Button variant="outline">{m.studio_unpublish()}</Button>}
      title={m.studio_unpublish_title({ name: course.name })}
      consequence={m.studio_unpublish_consequence()}
      confirmLabel={m.studio_unpublish()}
      onConfirm={confirm}
      pending={lifecycle.isPending}
      error={lifecycle.error}
    />
  )
}
