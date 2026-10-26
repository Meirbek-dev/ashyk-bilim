import { Link as RouterLink, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

/** Text only when wide, as in the studio header: on a phone the title (the activity) keeps the room. */
const LABEL = 'sr-only @3xl:not-sr-only'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId_/submissions/$submissionId'

/** The review's «back» (B-GRD-38): where it was opened from - the inbox, the gradebook, else the activity's queue. */
export function ReviewBack() {
  const { courseId, activityId } = useParams({ from: ROUTE })
  const { from, ...queue } = useSearch({ from: ROUTE })
  const className = buttonVariants({ variant: 'ghost' })
  if (from === 'inbox')
    return (
      <RouterLink to="/teach" className={className}>
        <ArrowLeft aria-hidden />
        <span className={LABEL}>{m.platform_back_to_inbox()}</span>
      </RouterLink>
    )
  if (from === 'gradebook')
    return (
      <RouterLink to="/teach/courses/$courseId/gradebook" params={{ courseId }} className={className}>
        <ArrowLeft aria-hidden />
        <span className={LABEL}>{m.platform_back_to_gradebook()}</span>
      </RouterLink>
    )
  return (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/submissions"
      params={{ courseId, activityId }}
      search={queue}
      className={className}
    >
      <ArrowLeft aria-hidden />
      <span className={LABEL}>{m.platform_back_to_submissions()}</span>
    </RouterLink>
  )
}
