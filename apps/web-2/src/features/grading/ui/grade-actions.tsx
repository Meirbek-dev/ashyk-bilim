import { m } from '#/paraglide/messages'
import type { GradeAction } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'

import { isStale } from './use-conflict'

// The primary first where they stack in a column; in a bar it ends the line, under the eye and the hand.
const ORDERS = {
  column: ['publish', 'save', 'return'],
  bar: ['save', 'return', 'publish'],
} as const satisfies Record<string, readonly GradeAction[]>
const labels = {
  save: m.grading_save,
  publish: m.grading_publish,
  return: m.grading_return,
} satisfies Record<GradeAction, () => string>

type GradeActionsProps = {
  /** `allowed_actions` of the work: only these buttons exist (B-GRD-14). */
  allowed: readonly GradeAction[]
  /** The action in flight. */
  pending: GradeAction | null
  onAction: (action: GradeAction) => void
  /** The save's error; a 412 is the conflict dialog's, not shown here. */
  error: unknown
  /** The grade is out already: publishing again updates what the learner sees (B-GRD-36). */
  published?: boolean
  /** `column`: the marking column's stack; `bar`: one line at the foot of a long form. */
  layout?: keyof typeof ORDERS
}

/** Save draft, return for revision, publish (the one primary): each submits the form with its action. */
export function GradeActions({
  allowed,
  pending,
  onAction,
  error,
  published = false,
  layout = 'column',
}: GradeActionsProps) {
  return (
    <div className="flex flex-col gap-3">
      {error && !isStale(error) ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      <div className={layout === 'column' ? 'flex flex-col gap-2 *:w-full' : 'flex flex-wrap gap-2'}>
        {ORDERS[layout]
          .filter(action => allowed.includes(action))
          .map(action => (
            <SubmitButton
              key={action}
              type="button"
              variant={action === 'publish' ? 'default' : 'outline'}
              pending={pending === action}
              disabled={pending !== null}
              onClick={() => onAction(action)}
            >
              {action === 'publish' && published ? m.grading_republish() : labels[action]()}
            </SubmitButton>
          ))}
      </div>
    </div>
  )
}
