import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId, UserId } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { SheetPanel } from '#/shared/components/sheet-panel'

import { ClassMapError } from './class-map-error'
import { LearnerDetail } from './learner-detail'

type LearnerSheetProps = { courseId: CourseId; userId: UserId; onClose: () => void }

/** The learner open by `?learner=` (B-CON-10): their level in each concept of the course. */
export function LearnerSheet({ courseId, userId, onClose }: LearnerSheetProps) {
  return (
    <SheetPanel
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      side="right"
      title={m.concepts_learner_title()}
    >
      <CatchBoundary getResetKey={() => userId} errorComponent={ClassMapError}>
        <Suspense fallback={<ListSkeleton />}>
          <LearnerDetail courseId={courseId} userId={userId} />
        </Suspense>
      </CatchBoundary>
    </SheetPanel>
  )
}
