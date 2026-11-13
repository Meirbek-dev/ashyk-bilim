import { Link as RouterLink, useLoaderData, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { ActivityHeader, PreviewNote } from '#/features/player'
import { m } from '#/paraglide/messages'
import { EmptyState } from '#/shared/components/empty-state'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'

import { TaskView } from './task-view'

const ROUTE = '/_authed/learn/$courseId/$activityId_/submission'

/**
 * Handing in files (spec 5.4): focus layout, back to the activity in the player. The loader names the course and
 * the activity from the learner state and says whether the activity is locked or previewed by staff (B-FSB-25).
 */
export function SubmissionPage() {
  const { courseId, activityId } = useParams({ from: ROUTE })
  const { title, courseTitle, locked, preview } = useLoaderData({ from: ROUTE })
  // Staff previewing leave to the studio, as from a test or a code challenge (an unpublished task is in no outline).
  const back = preview ? (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/edit"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      <span className="sr-only @3xl:not-sr-only">{m.player_preview_studio()}</span>
    </RouterLink>
  ) : (
    <RouterLink
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      <span className="sr-only @3xl:not-sr-only">{m.submission_back()}</span>
    </RouterLink>
  )
  return (
    <FocusPage back={back} title={courseTitle}>
      <article className="flex flex-col gap-gutter @3xl:gap-8">
        {preview ? <PreviewNote /> : null}
        <ActivityHeader type="file_submission" title={title} />
        {locked ? (
          <EmptyState>{m.submission_locked()}</EmptyState>
        ) : (
          <TaskView courseId={courseId} activityId={activityId} />
        )}
      </article>
    </FocusPage>
  )
}
