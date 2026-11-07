import { Suspense, useState } from 'react'

import { BlockEditor } from '#/features/editor'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Skeleton } from '#/shared/ui/skeleton'

import { ActivityHeading } from './activity-heading'
import { useAutosave } from './use-autosave'

/** A lesson page: the block editor (`authoring` preset) with autosave and the conflict dialog. */
export function PageEditor({ courseId, activity }: { courseId: string; activity: ActivityDetail }) {
  // Captured once: the editor owns the document while the user types; saves only move `version` forward.
  const [content] = useState(() => activity.content)
  const autosave = useAutosave(courseId, activity)
  return (
    // Edge to edge and at least the window's height under the bar and the tabs (3.5 + 2.75 rem): the page is the screen.
    <div className="-mx-4 -mt-gutter -mb-gutter flex min-h-[calc(100dvh-6.25rem)] flex-col @3xl:-mx-8 @3xl:-mb-10">
      {autosave.error ? <ErrorAlert>{presentError(autosave.error)}</ErrorAlert> : null}
      <Suspense fallback={<Skeleton className="h-row w-full" />}>
        <BlockEditor
          activityId={activity.id}
          content={content}
          onChange={autosave.change}
          header={<ActivityHeading type={activity.activity_type} title={activity.name} />}
        />
      </Suspense>
      <ConflictDialog
        open={autosave.conflict}
        onOpenChange={autosave.setConflict}
        onRetry={() => void autosave.reloadAndRetry()}
        pending={autosave.pending}
      />
    </div>
  )
}
