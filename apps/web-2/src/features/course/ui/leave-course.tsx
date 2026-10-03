import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { leaveOptions } from '../queries'

/** Leave through the confirmation that names the course; the header then offers "Enrol" again (BUG-074). */
export function LeaveCourse({ course }: { course: Course }) {
  const [open, setOpen] = useState(false)
  const leave = useMutation(leaveOptions(course.id))
  const confirm = () =>
    leave.mutate(
      { path: { course_id: course.id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast.add({ title: m.course_left() })
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) leave.reset()
      }}
      trigger={<Button variant="outline">{m.course_leave()}</Button>}
      title={m.course_leave_title({ name: course.name })}
      consequence={m.course_leave_consequence()}
      confirmLabel={m.course_leave()}
      onConfirm={confirm}
      pending={leave.isPending}
      error={leave.error}
    />
  )
}
