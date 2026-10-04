import { Link as RouterLink, useLoaderData, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { buttonVariants } from '#/shared/ui/button'

import { TaskView } from './task-view'

const meta = activityTypeMeta.file_submission

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
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <meta.icon aria-hidden className={`size-4 ${meta.ink}`} />
            {meta.label()}
          </p>
          <h1 className="text-2xl font-semibold wrap-anywhere">{title}</h1>
        </header>
        {locked ? (
          <p className="text-muted-foreground">{m.submission_locked()}</p>
        ) : (
          <TaskView courseId={courseId} activityId={activityId} />
        )}
      </article>
    </FocusPage>
  )
}
