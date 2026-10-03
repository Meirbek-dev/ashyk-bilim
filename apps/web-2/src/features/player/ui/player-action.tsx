import { useHotkey } from '@tanstack/react-hotkeys'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { shortcuts } from '#/features/catalog'
import { m } from '#/paraglide/messages'
import type { ActivityState, LearnerCourseState } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { Link } from '#/shared/ui/link'

import { activityKind, playerAction, type EntryAction } from '../model/player'
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
  const mark = useMutation(markOptions(courseId))
  const unmark = useMutation(unmarkOptions(courseId))
  const action = playerAction(state, entry)
  const path = { path: { activity_id: entry.id } }
  const pending = mark.isPending || unmark.isPending
  const submit = () => {
    if (action?.kind === 'mark' && !pending) mark.mutate(path, { onSuccess: () => toast(m.player_marked()) })
  }
  useHotkey(shortcuts.mark.hotkey, submit)
  const error = mark.error ?? unmark.error
  const unmarkable = entry.complete && !entry.blocked_reason && activityKind(entry.activity_type) === 'lesson'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {action?.kind === 'mark' ? (
          <Button pending={mark.isPending} onClick={submit}>
            {m.player_mark()}
          </Button>
        ) : null}
        {action?.kind === 'continue' ? (
          <Link
            to="/learn/$courseId/$activityId"
            params={{ courseId, activityId: action.activityId }}
            variant="primary"
          >
            {m.player_continue()}
          </Link>
        ) : null}
        {action?.kind === 'finish' ? (
          <Link to="/learn/$courseId/complete" params={{ courseId }} variant="primary">
            {m.player_finish()}
          </Link>
        ) : null}
        {action?.kind === 'open' ? (
          <Link to={childRoutes[action.route]} params={{ courseId, activityId: entry.id }} variant="primary">
            {entryLabels[action.action]()}
          </Link>
        ) : null}
        {unmarkable ? (
          <Button
            variant="ghost"
            pending={unmark.isPending}
            disabled={pending}
            onClick={() => unmark.mutate(path, { onSuccess: () => toast(m.player_unmarked()) })}
          >
            {m.player_unmark()}
          </Button>
        ) : null}
      </div>
      {error ? <Alert>{presentError(error)}</Alert> : null}
    </div>
  )
}
