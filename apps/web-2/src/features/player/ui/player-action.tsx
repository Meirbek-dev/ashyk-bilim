import { useHotkey } from '@tanstack/react-hotkeys'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { shortcuts } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import type { ActivityState, LearnerCourseState } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { buttonVariants } from '#/shared/components/button-variants'
import { toast } from '#/shared/ui/toast'

import { activityKind, locate, playerAction, type EntryAction } from '../model/player'
import { markOptions, unmarkOptions } from '../queries'

const entryLabels = {
  start: m.player_entry_start,
  continue: m.player_continue,
  revise: m.player_entry_revise,
  view_feedback: m.player_entry_view_feedback,
  view_receipt: m.player_entry_view_receipt,
} satisfies Record<EntryAction, () => string>

const childRoutes = {
  attempt: '/learn/$courseId/$activityId/attempt',
  code: '/learn/$courseId/$activityId/code',
  submission: '/learn/$courseId/$activityId/submission',
} as const

/**
 * The one primary action of the activity (spec 5.4), decided by `playerAction` from the server's state. A lesson is
 * marked here (M); the answer re-reads the learner state, so the contents, progress and next step follow.
 */
export function PlayerAction({ state, entry }: { state: LearnerCourseState; entry: ActivityState }) {
  const courseId = state.course_id
  const queryClient = useQueryClient()
  const mark = useMutation(markOptions(queryClient, courseId))
  const unmark = useMutation(unmarkOptions(queryClient, courseId))
  const action = playerAction(state, entry)
  const path = { path: { activity_id: entry.id } }
  const pending = mark.isPending || unmark.isPending
  const submit = () => {
    if (action?.kind === 'mark' && !pending)
      mark.mutate(path, { onSuccess: () => toast.add({ title: m.player_marked() }) })
  }
  useHotkey(shortcuts.mark.hotkey, submit)
  const error = mark.error ?? unmark.error
  const unmarkable = entry.complete && !entry.blocked_reason && activityKind(entry.activity_type) === 'lesson'
  return (
    <div className="flex flex-col items-start gap-2 empty:hidden">
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {action?.kind === 'mark' ? (
          <SubmitButton onClick={submit} pending={mark.isPending}>
            {m.player_mark()}
          </SubmitButton>
        ) : null}
        {action?.kind === 'continue' ? (
          <RouterLink
            to="/learn/$courseId/$activityId"
            params={{ courseId, activityId: action.activityId }}
            className={buttonVariants({ className: 'max-w-full' })}
          >
            {/* Names where it leads: «Следующая» beside it is the contents neighbour, which may already be done. */}
            <span className="truncate">
              {m.player_next_step({ title: locate(state, action.activityId)?.entry.title ?? '' })}
            </span>
            <ArrowRight aria-hidden />
          </RouterLink>
        ) : null}
        {action?.kind === 'finish' ? (
          <RouterLink to="/learn/$courseId/complete" params={{ courseId }} className={buttonVariants()}>
            {m.player_finish()}
          </RouterLink>
        ) : null}
        {action?.kind === 'open' ? (
          <RouterLink
            to={childRoutes[action.route]}
            params={{ courseId, activityId: entry.id }}
            className={buttonVariants()}
          >
            {/* OPEN-E-6: a failed test with an attempt left leads with the retake. */}
            {entry.state === 'failed' && action.action === 'start'
              ? m.attempt_try_again()
              : entryLabels[action.action]()}
          </RouterLink>
        ) : null}
        {unmarkable ? (
          <SubmitButton
            variant="ghost"
            pending={unmark.isPending}
            disabled={pending}
            onClick={() => unmark.mutate(path, { onSuccess: () => toast.add({ title: m.player_unmarked() }) })}
          >
            {m.player_unmark()}
          </SubmitButton>
        ) : null}
      </div>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
    </div>
  )
}
