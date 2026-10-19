import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'

/** A configured runner that does not answer (B-COD-23): the code stays; "Retry" asks the runner again. */
export function RunnerDown({ pending, onRetry }: { pending: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <ErrorAlert>{m.code_runner_down()}</ErrorAlert>
      <SubmitButton type="button" variant="outline" size="sm" pending={pending} onClick={onRetry}>
        {m.ui_retry()}
      </SubmitButton>
    </div>
  )
}
