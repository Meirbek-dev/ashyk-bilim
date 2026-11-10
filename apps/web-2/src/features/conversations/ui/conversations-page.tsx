import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useSearch } from '@tanstack/react-router'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { Link } from '#/shared/components/link'
import { ListPage } from '#/shared/components/templates/list-page'
import { formatNumber } from '#/shared/i18n/format'
import { unreadOptions } from '../queries'
import { ConversationsList } from './conversations-list'

/** /conversations (docs/DIALOGS.md 9): the newest first, the unread filter in the URL, «Написать» as the primary. */
export function ConversationsPage() {
  const { unread = false } = useSearch({ from: '/_authed/conversations/' })
  const { data: count } = useSuspenseQuery(unreadOptions())
  const filter = (
    <nav aria-label={m.conversations_filter_label()} className="flex w-full gap-6 overflow-x-auto border-b">
      <Link variant="tab" to="/conversations" search={{ unread: undefined }}>
        {m.conversations_filter_all()}
      </Link>
      <Link variant="tab" to="/conversations" search={{ unread: true }}>
        {m.conversations_filter_unread()}
        {count.conversations > 0 ? (
          <span className="ml-2 text-muted-foreground tabular-nums">{formatNumber(count.conversations)}</span>
        ) : null}
      </Link>
    </nav>
  )
  const write = (
    <RouterLink to="/conversations/new" className={buttonVariants({ variant: 'default' })}>
      {m.conversations_write()}
    </RouterLink>
  )
  return (
    <ListPage title={m.conversations_title()} primaryAction={write} search={filter}>
      <ConversationsList unread={unread} />
    </ListPage>
  )
}
