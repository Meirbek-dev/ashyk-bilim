import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

/** Why the send failed, and «Повторить»: the same text with the same key, so an arrived request is not doubled. */
export function SendError({ id, error, onRetry }: { id: string; error: unknown; onRetry: () => void }) {
  return (
    <div id={id} role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
      <span>{presentError(error)}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {m.conversations_retry()}
      </Button>
    </div>
  )
}
