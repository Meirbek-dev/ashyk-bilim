import { useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { SubmissionId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { gateCode } from '../model/attempt'
import { submissionOptions } from '../queries'
import type { useExamGuard } from './use-exam-guard'

type RunnerAlertsProps = {
  guard: ReturnType<typeof useExamGuard>
  /** The 403 that shut saving, or null. */
  closed: unknown
  expired: boolean
  changed: boolean
  attemptId: SubmissionId
}

/** What stands between the learner and the next answer: violations, full screen, a closed gate, the clock. */
export function RunnerAlerts({ guard, closed, expired, changed, attemptId }: RunnerAlertsProps) {
  const queryClient = useQueryClient()
  // Handed in meanwhile (the server's timer sweep)? The reread turns the page into the result.
  const refresh = () => void queryClient.fetchQuery({ ...submissionOptions(attemptId), staleTime: 0 }).catch(() => null)
  return (
    <div className="flex flex-col gap-2 text-sm empty:hidden">
      {guard.active && guard.count > 0 ? (
        <p className="text-muted-foreground tabular-nums">
          {m.attempt_violations({ count: guard.count, threshold: guard.threshold })}
        </p>
      ) : null}
      {guard.exceeded ? <ErrorAlert>{m.attempt_violations_exceeded()}</ErrorAlert> : null}
      {guard.needsFullscreen ? (
        <div className="flex flex-wrap items-center gap-2">
          <p>{m.attempt_fullscreen_needed()}</p>
          <Button variant="outline" size="sm" onClick={guard.enterFullscreen}>
            {m.attempt_fullscreen_enter()}
          </Button>
        </div>
      ) : null}
      {changed ? <p className="text-warning">{m.attempt_changed()}</p> : null}
      {closed !== null || expired ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert>
            {expired ? m.attempt_time_up() : gateCode(closed) ? presentError(closed) : m.attempt_closed()}
          </ErrorAlert>
          <Button variant="outline" size="sm" onClick={refresh}>
            {m.attempt_refresh()}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
