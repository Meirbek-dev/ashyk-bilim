import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

type ShowMoreProps = { hasMore: boolean; pending: boolean; onMore: () => void }

/** The next page of an infinite list (spec 5.6: no page numbers). Renders nothing on the last page. */
export function ShowMore({ hasMore, pending, onMore }: ShowMoreProps) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center">
      <Button variant="outline" disabled={pending} onClick={onMore}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {m.ui_show_more()}
      </Button>
    </div>
  )
}
