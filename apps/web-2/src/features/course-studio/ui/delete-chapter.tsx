import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Chapter } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/ui/icon-button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { deleteChapterOptions } from '../curriculum-queries'

/** Delete a chapter with its activities, through the confirmation that names it. */
export function DeleteChapter({ courseId, chapter }: { courseId: string; chapter: Chapter }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteChapterOptions(useQueryClient(), courseId))
  const confirm = () =>
    remove.mutate(
      { path: { chapter_id: chapter.id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast(m.studio_deleted())
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<IconButton label={m.studio_delete_named({ name: chapter.name })} icon={<Trash2 aria-hidden />} />}
      title={m.studio_chapter_delete_title({ name: chapter.name })}
      consequence={m.studio_chapter_delete_consequence()}
      confirmLabel={m.studio_delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
