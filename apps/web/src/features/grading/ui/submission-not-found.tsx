import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

/** An unknown, malformed or foreign submission id, or an activity without hand-ins: the API answers 404. */
export function SubmissionNotFound() {
  const { courseId, activityId } = useParams({ strict: false })
  const back =
    courseId && activityId ? (
      <RouterLink
        to="/teach/courses/$courseId/activities/$activityId/submissions"
        params={{ courseId, activityId }}
        className={buttonVariants({ variant: 'ghost' })}
      >
        <ArrowLeft aria-hidden />
        {m.platform_back()}
      </RouterLink>
    ) : null
  return (
    <FocusPage back={back} title={m.grading_not_found()}>
      <h1 className="text-2xl font-semibold">{m.grading_not_found()}</h1>
    </FocusPage>
  )
}
