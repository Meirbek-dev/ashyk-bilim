import { useParams, Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown, malformed or foreign activity id in the studio: the API answers 404 for all of them. */
export function ActivityNotFound() {
  const { courseId } = useParams({ strict: false })
  const back = courseId ? (
    <RouterLink
      to="/teach/courses/$courseId/content"
      params={{ courseId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.platform_back_to_course()}
    </RouterLink>
  ) : null
  return (
    <FocusPage back={back} title={m.studio_activity_not_found()}>
      {/* As a missing course: why it may be gone and the way on, not a bare heading on an empty page. */}
      <StatusScreen title={m.studio_activity_not_found()} text={m.ui_not_found_text()}>
        {courseId ? (
          <RouterLink to="/teach/courses/$courseId/content" params={{ courseId }} className={buttonVariants()}>
            {m.platform_tab_content()}
          </RouterLink>
        ) : null}
      </StatusScreen>
    </FocusPage>
  )
}
