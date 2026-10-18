import { Link as RouterLink, useLoaderData, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { ActivityHeader } from '#/features/player'
import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'

import { TaskView } from './task-view'

const ROUTE = '/_authed/learn/$courseId/$activityId_/submission'

/**
 * Handing in files (spec 5.4): focus layout, back to the activity in the player. The loader names the course and
 * the activity from the learner state and says whether the activity is locked.
 */
export function SubmissionPage() {
  const { courseId, activityId } = useParams({ from: ROUTE })
  const { title, courseTitle, locked } = useLoaderData({ from: ROUTE })
  const back = (
    <RouterLink
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.submission_back()}
    </RouterLink>
  )
  return (
    <FocusPage back={back} title={courseTitle}>
      <article className="flex flex-col gap-gutter">
        <ActivityHeader type="file_submission" title={title} />
        {locked ? (
          <p className="text-muted-foreground">{m.submission_locked()}</p>
        ) : (
          <TaskView courseId={courseId} activityId={activityId} />
        )}
      </article>
    </FocusPage>
  )
}
