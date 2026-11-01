import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { presentError } from '#/shared/i18n/errors'

import type { Runner } from '../../model/arena'
import { RunnerDown } from '../runner-down'

type RunNoticesProps = {
  runner: Runner['state']
  /** The runner is down: its read, or a run or hand-in answered so (B-COD-23). */
  down: boolean
  error: unknown
  retrying: boolean
  onRetry: () => void
}

/** Over «Запустить»: no runner configured (B-COD-09), the runner down with «Повторить» (B-COD-23), a refused run. */
export function RunNotices({ runner, down, error, retrying, onRetry }: RunNoticesProps) {
  if (runner === 'off')
    return <p className="border-t px-3 py-2 text-sm text-muted-foreground">{m.code_runner_unavailable()}</p>
  if (down)
    return (
      <div className="border-t px-3 py-2">
        <RunnerDown pending={retrying} onRetry={onRetry} />
      </div>
    )
  if (!error) return null
  return (
    <div className="border-t px-3 py-2">
      <ErrorAlert>{presentError(error)}</ErrorAlert>
    </div>
  )
}
