import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** An unknown id, a malformed one, or a course hidden from the caller: the API does not tell them apart (UX-078). */
export function CourseNotFound() {
  return (
    <StatusScreen title={m.course_not_found()} text={m.ui_not_found_text()}>
      <RouterLink to="/courses" className={buttonVariants()}>
        {m.course_catalog()}
      </RouterLink>
    </StatusScreen>
  )
}
