import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Chapter } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { deleteChapterOptions } from '../curriculum-queries'

/** Delete a chapter with its activities, through the confirmation that names it. */
export function DeleteChapter({ courseId, chapter }: { courseId: string; chapter: Chapter }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteChapterOptions(useQueryClient(), courseId))
  const confirm = () =>
    remove.mutate(
      { path: { chapter_id: chapter.id }, headers: { 'If-Match': chapter.version } },
      {
        onSuccess: () => {
          setOpen(false)
          toast.add({ title: m.studio_deleted() })
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
