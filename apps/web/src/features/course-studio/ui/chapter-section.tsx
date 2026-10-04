import { useSortable } from '@dnd-kit/react/sortable'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CurriculumChapter } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { toast } from '#/shared/ui/toast'

import { chapterVersion, updateChapterOptions } from '../curriculum-queries'
import { isStale } from '../model/course'
import { ActivityRow } from './activity-row'
import { CreateActivityDialog } from './create-activity-dialog'
import { DeleteChapter } from './delete-chapter'
import { RenameForm } from './rename-form'
import { useIfMatch } from './use-if-match'

type ChapterSectionProps = { courseId: string; chapter: CurriculumChapter; index: number }

/** Rename in place, saved with `If-Match: version`; a 412 opens the conflict dialog. */
function useRename(courseId: string, chapter: CurriculumChapter) {
  const [renaming, setRenaming] = useState(false)
  const renameButton = useRef<HTMLButtonElement>(null)
  const queryClient = useQueryClient()
  const rename = useMutation(updateChapterOptions(queryClient, courseId))
  const done = () => {
    setRenaming(false)
    rename.reset()
    renameButton.current?.focus()
  }
  const write = useIfMatch(
    (name: string, version: number) =>
      rename.mutateAsync(
        { path: { chapter_id: chapter.id }, body: { name }, headers: { 'If-Match': version } },
        {
          onSuccess: () => {
            toast.add({ title: m.studio_saved() })
            done()
          },
        },
      ),
    () => chapterVersion(queryClient, courseId, chapter),
  )
  // Other errors are on `rename.error` (shown by the form).
  const save = (name: string) => void write.save(name, chapter.version).catch(() => undefined)
  return { renaming, setRenaming, renameButton, rename, done, save, dialog: write.dialog }
}

/** One chapter: a sortable block (by its handle) that also takes activities dropped onto it, even when empty. */
export function ChapterSection({ courseId, chapter, index }: ChapterSectionProps) {
  const allowed = (action: CurriculumChapter['allowed_actions'][number]) => chapter.allowed_actions.includes(action)
  const { ref, handleRef, isDragging } = useSortable({
    id: chapter.id,
    index,
    type: 'chapter',
    accept: ['chapter', 'activity'],
    // CollisionPriority.Low: an activity row under the pointer wins over its chapter.
    collisionPriority: 1,
    disabled: !allowed('move'),
  })
  const { renaming, setRenaming, renameButton, rename, done, save, dialog } = useRename(courseId, chapter)
  return (
    // Without `move` the row is not a sortable at all: dnd-kit would make the row itself a button.
    <li ref={allowed('move') ? ref : undefined} className={`flex flex-col gap-3 ${isDragging ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        {allowed('move') ? (
          <IconButton
            ref={handleRef}
            label={m.studio_drag_named({ name: chapter.name })}
            icon={<GripVertical aria-hidden />}
          />
        ) : null}
        {renaming ? (
          <RenameForm
            name={chapter.name}
            onSave={save}
            onCancel={done}
            pending={rename.isPending}
            error={isStale(rename.error) ? null : rename.error}
          />
        ) : (
          <h2 className="min-w-0 flex-1 text-xl font-semibold wrap-anywhere">{chapter.name}</h2>
        )}
        {/* Stays mounted while renaming: focus comes back to it after Save or Escape (UX-214). */}
        {allowed('update') ? (
          <IconButton
            ref={renameButton}
            label={m.studio_rename_named({ name: chapter.name })}
            icon={<Pencil aria-hidden />}
            onClick={() => setRenaming(true)}
          />
        ) : null}
        <ConflictDialog {...dialog} />
        {allowed('delete') ? <DeleteChapter courseId={courseId} chapter={chapter} /> : null}
        {allowed('add_activity') ? <CreateActivityDialog courseId={courseId} chapter={chapter} /> : null}
      </div>
      {chapter.activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.studio_chapter_empty()}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {chapter.activities.map((activity, at) => (
            <ActivityRow key={activity.id} courseId={courseId} activity={activity} index={at} />
          ))}
        </ol>
      )}
    </li>
  )
}
