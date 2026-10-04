import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, QaThreadSummary } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { deleteThreadOptions } from '../queries'

type DeleteThreadProps = { courseId: CourseId; thread: QaThreadSummary; title: string; onDeleted: () => void }

/** Deleting a thread asks first, by its title (B-AI-12). */
export function DeleteThread({ courseId, thread, title, onDeleted }: DeleteThreadProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const remove = useMutation(deleteThreadOptions(queryClient, courseId, thread.id))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<IconButton label={m.ai_delete_thread()} icon={<Trash2 aria-hidden />} />}
      title={m.ai_delete_thread_title({ title })}
      consequence={m.ai_delete_thread_consequence()}
      confirmLabel={m.ai_delete_thread()}
      onConfirm={() =>
        remove.mutate(
          { path: { course_id: courseId, thread_id: thread.id } },
          {
            onSuccess: () => {
              setOpen(false)
              toast.add({ title: m.ai_thread_deleted() })
              onDeleted()
            },
          },
        )
      }
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
