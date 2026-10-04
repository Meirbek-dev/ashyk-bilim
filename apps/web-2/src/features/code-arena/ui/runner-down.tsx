import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

/** A configured runner that does not answer (B-COD-23): the code stays; "Retry" asks the runner again. */
export function RunnerDown({ pending, onRetry }: { pending: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <ErrorAlert>{m.code_runner_down()}</ErrorAlert>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRetry}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {m.ui_retry()}
      </Button>
    </div>
  )
}
