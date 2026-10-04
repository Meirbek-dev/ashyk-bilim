import { m } from '#/paraglide/messages'
import type { GradeAction } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { isStale } from './use-conflict'

const ORDER = ['save', 'return', 'publish'] as const satisfies readonly GradeAction[]
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
}

/** Save draft, return for revision, publish (the one primary): each submits the form with its action. */
export function GradeActions({ allowed, pending, onAction, error }: GradeActionsProps) {
  return (
    <div className="flex flex-col gap-4">
      {error && !isStale(error) ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      <div className="flex flex-wrap gap-2">
        {ORDER.filter(action => allowed.includes(action)).map(action => (
          <Button
            key={action}
            type="button"
            variant={action === 'publish' ? 'default' : 'outline'}
            disabled={pending !== null}
            onClick={() => onAction(action)}
          >
            {pending === action ? <Spinner data-icon="inline-start" /> : null}
            {labels[action]()}
          </Button>
        ))}
      </div>
    </div>
  )
}
