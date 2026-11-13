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
import { AddToChapter } from './add-to-chapter'
import { DeleteChapter } from './delete-chapter'
import { RenameForm } from './rename-form'
import { HANDLE, QUIET, ROW_TOOLS } from './row-tools'
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
  return { renaming, setRenaming, renameButton, rename, done, save, dialog: write.dialog() }
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
    <li ref={allowed('move') ? ref : undefined} className={`flex flex-col ${isDragging ? 'opacity-60' : ''}`}>
      <div className="group/row relative flex flex-wrap items-center gap-x-2 border-b pb-1.5">
        {allowed('move') ? (
          <div className={`${HANDLE} ${QUIET}`}>
            <IconButton
              ref={handleRef}
              aria-roledescription={m.studio_drag_role()}
              label={m.studio_drag_named({ name: chapter.name })}
              icon={<GripVertical aria-hidden />}
            />
          </div>
        ) : null}
        {/* The hanging numeral: activities' icons stand under it, their names under the chapter's. */}
        <span aria-hidden className="w-7 shrink-0 font-heading text-lg text-muted-foreground tabular-nums @3xl:text-xl">
          {index + 1}
        </span>
        {renaming ? (
          <RenameForm
            name={chapter.name}
            onSave={save}
            onCancel={done}
            pending={rename.isPending}
            error={isStale(rename.error) ? null : rename.error}
          />
        ) : (
          <h2 className="min-w-0 flex-1 basis-40 text-lg font-semibold wrap-anywhere @3xl:text-xl">{chapter.name}</h2>
        )}
        <div className={`ms-auto flex items-center ${ROW_TOOLS} ${QUIET}`}>
          {/* Stays mounted while renaming: focus comes back to it after Save or Escape (UX-214). */}
          {allowed('update') ? (
            <IconButton
              ref={renameButton}
              label={m.studio_rename_named({ name: chapter.name })}
              icon={<Pencil aria-hidden />}
              onClick={() => setRenaming(true)}
            />
          ) : null}
          {/* Without `delete` (learner work) the dialog explains and offers to hide it instead. */}
          {allowed('delete') || allowed('update') ? <DeleteChapter courseId={courseId} chapter={chapter} /> : null}
        </div>
        <ConflictDialog {...dialog} />
      </div>
      {chapter.activities.length === 0 ? (
        <p className="border-b py-3 ps-9 text-sm text-muted-foreground">{m.studio_chapter_empty()}</p>
      ) : (
        <ol className="flex flex-col divide-y border-b">
          {chapter.activities.map((activity, at) => (
            <ActivityRow key={activity.id} courseId={courseId} activity={activity} index={at} />
          ))}
        </ol>
      )}
      {allowed('add_activity') ? <AddToChapter courseId={courseId} chapter={chapter} /> : null}
    </li>
  )
}
