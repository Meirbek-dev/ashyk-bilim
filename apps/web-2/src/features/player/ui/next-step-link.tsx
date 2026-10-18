import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ActivityId, CourseId } from '#/shared/api/gen/types.gen'
import { buttonVariants } from '#/shared/components/button-variants'

import { nextStep } from '../model/player'
import { learnerStateOptions } from '../queries'

type NextStepProps = { courseId: CourseId; activityId: ActivityId; variant?: 'default' | 'outline' }

/** The way on after handing in graded work (B-PLY-18): «Next: <title>» or the course summary after the last activity. */
export function NextStepLink({ courseId, activityId, variant = 'default' }: NextStepProps) {
  const { data: state } = useSuspenseQuery(learnerStateOptions(courseId))
  const step = nextStep(state, activityId)
  if (!step) return null
  const className = buttonVariants({ variant, className: 'max-w-full' })
  if (step.kind === 'finish')
    return (
      <RouterLink to="/learn/$courseId/complete" params={{ courseId }} className={className}>
        {m.player_finish()}
        <ArrowRight aria-hidden />
      </RouterLink>
    )
  return (
    <RouterLink
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId: step.activity.id }}
      className={className}
    >
      <span className="truncate">{m.player_next_step({ title: step.activity.title })}</span>
      <ArrowRight aria-hidden />
    </RouterLink>
  )
}
