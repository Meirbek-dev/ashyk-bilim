import { m } from '#/paraglide/messages'
import { SubmitButton } from '#/shared/components/submit-button'

type ShowMoreProps = { hasMore: boolean; pending: boolean; onMore: () => void }

/** The next page of an infinite list (spec 5.6: no page numbers). Renders nothing on the last page. */
export function ShowMore({ hasMore, pending, onMore }: ShowMoreProps) {
  if (!hasMore) return null
  return (
    <div className="flex justify-center">
      <SubmitButton variant="outline" pending={pending} onClick={onMore}>
        {m.ui_show_more()}
      </SubmitButton>
    </div>
  )
}
