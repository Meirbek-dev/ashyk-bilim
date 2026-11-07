import { useSortable } from '@dnd-kit/react/sortable'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Activity, ActivityAction } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { IconButton } from '#/shared/components/icon-button'
import { toast } from '#/shared/ui/toast'

import { updateActivityOptions } from '../curriculum-queries'
import { ActivityLine } from './activity-line'
import { ActivityStatusBadge } from './activity-status'
import { DeleteActivity } from './delete-activity'
import { QuickPublish } from './quick-publish'
import { RenameForm } from './rename-form'
import { HANDLE, QUIET, ROW_TOOLS } from './row-tools'

type ActivityRowProps = { courseId: string; activity: Activity; index: number }

/** Renaming in place; focus goes back to the rename button after Save or Escape (UX-214). */
function useRename(courseId: string, activity: Activity) {
  const [renaming, setRenaming] = useState(false)
  const renameButton = useRef<HTMLButtonElement>(null)
  const rename = useMutation(updateActivityOptions(useQueryClient(), courseId))
  const done = () => {
    setRenaming(false)
    rename.reset()
    renameButton.current?.focus()
  }
  const save = (name: string) =>
    rename.mutate(
      { path: { activity_id: activity.id }, body: { name }, headers: { 'If-Match': activity.version } },
      {
        onSuccess: () => {
          toast.add({ title: m.studio_saved() })
          done()
        },
      },
    )
  return { renaming, setRenaming, renameButton, rename, done, save }
}

/** One activity of a chapter: type, name (into its studio), status; sortable within and across chapters. */
export function ActivityRow({ courseId, activity, index }: ActivityRowProps) {
  const allowed = (action: ActivityAction) => activity.allowed_actions.includes(action)
  const { ref, handleRef, isDragging } = useSortable({
    id: activity.id,
    index,
    group: activity.chapter_id,
    type: 'activity',
    accept: 'activity',
    disabled: !allowed('move'),
  })
  const { renaming, setRenaming, renameButton, rename, done, save } = useRename(courseId, activity)
  const status = <ActivityStatusBadge published={activity.published} />
  return (
    // Without `move` the row is not a sortable at all: dnd-kit would make the row itself a button.
    <li
      ref={allowed('move') ? ref : undefined}
      className={`group/row relative flex min-h-row flex-wrap items-center gap-x-2 rounded-md py-1.5 transition-colors duration-150 hover:bg-muted/60 [&_button]:relative [&_button]:z-1 [&_form]:relative [&_form]:z-1 ${isDragging ? 'z-10 bg-background opacity-60' : ''}`}
    >
      {/* Wide, the handle hangs in the page's margin until the row is pointed at, so names line up with the chapter's. */}
      {allowed('move') ? (
        <div className={`${HANDLE} ${QUIET}`}>
          <IconButton
            ref={handleRef}
            aria-roledescription={m.studio_drag_role()}
            label={m.studio_drag_named({ name: activity.name })}
            icon={<GripVertical aria-hidden />}
          />
        </div>
      ) : null}
      <span className="flex w-7 shrink-0 justify-start">
        <ActivityIcon type={activity.activity_type} size="sm" />
      </span>
      {renaming ? (
        <RenameForm
          name={activity.name}
          onSave={save}
          onCancel={done}
          pending={rename.isPending}
          error={rename.error}
        />
      ) : (
        <ActivityLine courseId={courseId} activity={activity} status={status} />
      )}
      <div className="ms-auto flex items-center gap-2">
        {renaming ? status : null}
        {/* A column of its own while any lesson of the course is a draft (the page sets --quick), so the rest line up. */}
        <div className="flex items-center justify-end gap-2 @3xl:min-w-(--quick)">
          <QuickPublish courseId={courseId} activity={activity} onPublished={() => renameButton.current?.focus()} />
        </div>
        <div className={`flex items-center ${ROW_TOOLS} ${QUIET}`}>
          {/* Stays mounted while renaming: focus comes back to it after Save or Escape (UX-214). */}
          {allowed('update') ? (
            <IconButton
              ref={renameButton}
              label={m.studio_rename_named({ name: activity.name })}
              icon={<Pencil aria-hidden />}
              onClick={() => setRenaming(true)}
            />
          ) : null}
          {/* Without `delete` (learner work) the dialog explains and offers to hide it instead. */}
          {allowed('delete') || allowed('update') ? <DeleteActivity courseId={courseId} activity={activity} /> : null}
        </div>
      </div>
    </li>
  )
}
