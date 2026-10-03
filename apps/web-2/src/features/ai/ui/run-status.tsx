import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { runErrorText, stepLabels } from '../model/labels'
import { isPending, type RunState } from '../model/run'

type RunStatusProps = {
  state: RunState
  onCancel: () => void
  cancelling: boolean
  /** Starts the run again after an error or a cancel. */
  onRetry: () => void
}

/** Where a run is: the server's step and "Stop" while it runs; the error's text and "Retry" after (B-AI-07, B-AI-08). */
export function RunStatus({ state, onCancel, cancelling, onRetry }: RunStatusProps) {
  if (isPending(state)) {
    const step = state.drops > 0 ? m.ai_reconnecting() : stepLabels[state.step ?? 'queued']()
    return (
      <div className="flex items-center justify-between gap-2">
        <output className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden />
          {step}
        </output>
        <Button variant="outline" size="sm" disabled={!state.runId || cancelling} onClick={onCancel}>
          {m.ai_stop()}
        </Button>
      </div>
    )
  }
  if (state.phase !== 'failed' && state.phase !== 'cancelled') return null
  return (
    <div className="flex flex-col items-start gap-2">
      {state.phase === 'cancelled' ? (
        <p className="text-sm text-muted-foreground">{m.errors_ai_run_cancelled()}</p>
      ) : (
        <ErrorAlert>{runErrorText(state.errorCode)}</ErrorAlert>
      )}
      <Button variant="outline" size="sm" onClick={onRetry}>
        {m.ui_retry()}
      </Button>
    </div>
  )
}
