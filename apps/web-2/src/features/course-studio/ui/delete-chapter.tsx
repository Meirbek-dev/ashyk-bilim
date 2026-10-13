import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CurriculumChapter } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'

import { deleteChapterOptions, learnerWorkRefusal, updateActivityOptions } from '../curriculum-queries'

/**
 * Delete a chapter with its activities, through the confirmation that names it. A chapter whose activities hold
 * learner work is never deleted (no `delete` in `allowed_actions`, or a 409 from a stale view): the dialog offers to
 * hide it instead - every published activity of it is unpublished - or says that it already is hidden.
 */
export function DeleteChapter({ courseId, chapter }: { courseId: string; chapter: CurriculumChapter }) {
  const [open, setOpen] = useState(false)
  const [hiding, setHiding] = useState(false)
  const queryClient = useQueryClient()
  const remove = useMutation(deleteChapterOptions(queryClient, courseId))
  const hide = useMutation(updateActivityOptions(queryClient, courseId))
  const locked = !chapter.allowed_actions.includes('delete') || learnerWorkRefusal(remove.error)
  const published = chapter.activities.filter(activity => activity.published)
  const done = (title: string) => {
    setOpen(false)
    toast.add({ title })
  }
  const hideAll = async () => {
    setHiding(true)
    try {
      for (const activity of published)
        await hide.mutateAsync({
          path: { activity_id: activity.id },
          body: { published: false },
          headers: { 'If-Match': activity.version },
        })
      done(m.studio_chapter_hidden())
    } catch {
      // Shown in the dialog (`hide.error`); the activities already unpublished stay so.
    } finally {
      setHiding(false)
    }
  }
  const confirm = () =>
    locked
      ? void hideAll()
      : remove.mutate(
          { path: { chapter_id: chapter.id }, headers: { 'If-Match': chapter.version } },
          { onSuccess: () => done(m.studio_deleted()) },
        )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) {
          remove.reset()
          hide.reset()
        }
      }}
      trigger={<IconButton label={m.studio_delete_named({ name: chapter.name })} icon={<Trash2 aria-hidden />} />}
      title={
        locked
          ? m.studio_chapter_locked_title({ name: chapter.name })
          : m.studio_chapter_delete_title({ name: chapter.name })
      }
      consequence={
        !locked
          ? m.studio_chapter_delete_consequence()
          : published.length > 0
            ? m.studio_chapter_locked_consequence()
            : m.studio_chapter_locked_hidden()
      }
      confirmLabel={locked ? m.studio_hide() : m.studio_delete()}
      onConfirm={locked && published.length === 0 ? undefined : confirm}
      pending={remove.isPending || hiding}
      error={locked ? hide.error : remove.error}
    />
  )
}
