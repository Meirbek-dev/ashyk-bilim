import { useSortable } from '@dnd-kit/react/sortable'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Activity, ActivityAction } from '#/shared/api/gen/types.gen'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { IconButton } from '#/shared/ui/icon-button'
import { Link } from '#/shared/ui/link'

import { updateActivityOptions } from '../curriculum-queries'
import { ActivityStatusBadge } from './activity-status'
import { DeleteActivity } from './delete-activity'
import { RenameForm } from './rename-form'

type ActivityRowProps = { courseId: string; activity: Activity; index: number }

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
  const meta = activityTypeMeta[activity.activity_type]
  const TypeIcon = meta.icon
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
          toast(m.studio_saved())
          done()
        },
      },
    )
  return (
    // Without `move` the row is not a sortable at all: dnd-kit would make the row itself a button.
    <li
      ref={allowed('move') ? ref : undefined}
      className={`flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-card-foreground ${isDragging ? 'opacity-60' : ''}`}
    >
      {allowed('move') ? (
        <IconButton
          ref={handleRef}
          label={m.studio_drag_named({ name: activity.name })}
          icon={<GripVertical aria-hidden />}
        />
      ) : null}
      <TypeIcon aria-hidden className={`size-4 shrink-0 ${meta.ink}`} />
      <span className="text-sm text-muted-foreground">{meta.label()}</span>
      {renaming ? (
        <RenameForm
          name={activity.name}
          onSave={save}
          onCancel={done}
          pending={rename.isPending}
          error={rename.error}
        />
      ) : (
        <span className="min-w-0 flex-1 wrap-anywhere">
          <Link
            to="/teach/courses/$courseId/activities/$activityId/edit"
            params={{ courseId, activityId: activity.id }}
          >
            {activity.name}
          </Link>
        </span>
      )}
      <ActivityStatusBadge published={activity.published} />
      {/* Stays mounted while renaming: focus comes back to it after Save or Escape (UX-214). */}
      {allowed('update') ? (
        <IconButton
          ref={renameButton}
          label={m.studio_rename_named({ name: activity.name })}
          icon={<Pencil aria-hidden />}
          onClick={() => setRenaming(true)}
        />
      ) : null}
      {allowed('delete') ? <DeleteActivity courseId={courseId} activity={activity} /> : null}
    </li>
  )
}
