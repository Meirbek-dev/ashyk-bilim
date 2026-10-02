import { m } from '#/paraglide/messages'

import { Button } from './button'

type ShowMoreProps = { hasMore: boolean; pending: boolean; onMore: () => void }

/** The next page of an infinite list (spec 5.6: no page numbers). Renders nothing on the last page. */
export function ShowMore({ hasMore, pending, onMore }: ShowMoreProps) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center">
      <Button variant="outline" pending={pending} onClick={onMore}>
        {m.ui_show_more()}
      </Button>
    </div>
  )
}
