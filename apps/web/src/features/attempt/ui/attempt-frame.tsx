import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ComponentProps } from 'react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

export const ATTEMPT_ROUTE = '/_authed/learn/$courseId/$activityId_/attempt'
export const ATTEMPT_PATH = '/learn/$courseId/$activityId/attempt'

type FrameProps = Omit<ComponentProps<typeof FocusPage>, 'back'>

/** Every attempt screen: the focus layout whose way out is the activity in the player. */
export function AttemptFrame(props: FrameProps) {
  const { courseId, activityId } = useParams({ from: ATTEMPT_ROUTE })
  const back = (
    <RouterLink
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      <span className="sr-only @3xl:not-sr-only">{m.attempt_back()}</span>
    </RouterLink>
  )
  return <FocusPage back={back} {...props} />
}
