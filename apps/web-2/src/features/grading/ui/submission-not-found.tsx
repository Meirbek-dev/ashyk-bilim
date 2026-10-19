import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

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
      <StatusScreen title={m.grading_not_found()} text={m.ui_not_found_text()}>
        {courseId && activityId ? (
          <RouterLink
            to="/teach/courses/$courseId/activities/$activityId/submissions"
            params={{ courseId, activityId }}
            className={buttonVariants()}
          >
            {m.platform_tab_submissions()}
          </RouterLink>
        ) : null}
      </StatusScreen>
    </FocusPage>
  )
}
