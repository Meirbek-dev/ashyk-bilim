import { Suspense, useState } from 'react'

import { BlockEditor } from '#/features/editor'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Skeleton } from '#/shared/ui/skeleton'

import { useAutosave } from './use-autosave'

/** A lesson page: the block editor (`authoring` preset) with autosave and the conflict dialog. */
export function PageEditor({ courseId, activity }: { courseId: string; activity: ActivityDetail }) {
  // Captured once: the editor owns the document while the user types; saves only move `version` forward.
  const [content] = useState(() => activity.content)
  const autosave = useAutosave(courseId, activity)
  return (
    <div className="flex flex-col gap-4">
      {autosave.error ? <ErrorAlert>{presentError(autosave.error)}</ErrorAlert> : null}
      <Suspense fallback={<Skeleton className="h-row w-full" />}>
        <BlockEditor activityId={activity.id} content={content} onChange={autosave.change} />
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
