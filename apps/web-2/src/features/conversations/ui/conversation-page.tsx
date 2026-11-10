import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { SubmitButton } from '#/shared/components/submit-button'

import { buildFeed, denyText, newestId, personName } from '../model/feed'
import { messagesOptions } from '../queries'
import { Composer } from './composer'
import { ConversationMeta } from './conversation-meta'
import { FeedRows } from './feed-rows'
import { useFeedScroll, useMarkRead } from './use-feed'

const nowSeconds = () => Math.floor(Date.now() / 1000)

/**
 * /conversations/$conversationId (docs/DIALOGS.md 9): the person (a link to the profile) and a shared course over the
 * feed, oldest first; the composer under it, or the reason it is closed. Opening reads up to the newest message.
 */
export function ConversationPage() {
  const { conversationId } = useParams({ from: '/_authed/conversations/$conversationId' })
  const query = useSuspenseInfiniteQuery(messagesOptions(conversationId))
  // An entry point's context («Написать» from a course or a grading page) goes with the next message only.
  const context = useSearch({ from: '/_authed/conversations/$conversationId' })
  const navigate = useNavigate()
  const { data: session } = useSuspenseQuery(sessionOptions())
  const [head] = query.data.pages
  // The "New messages" line stays where it was when the feed opened, though reading moves the pointer on.
  const [opened] = useState(() => ({ read: head?.last_read_message_id ?? null, now: nowSeconds() }))
  const pages = query.data.pages.map(page => page.items)
  const rows = buildFeed({ pages, viewer: session?.user_id ?? '', lastRead: opened.read, now: opened.now })
  useMarkRead(conversationId, newestId(pages), head?.last_read_message_id ?? null)
  const { feed, quiet, earlier } = useFeedScroll(query)
  if (!head) return null
  const { peer } = head
  const name = personName(peer)
  const back = (
    <RouterLink to="/conversations" className={buttonVariants({ variant: 'ghost' })}>
      <ArrowLeft aria-hidden />
      {m.conversations_back()}
    </RouterLink>
  )
  const sent = () => {
    if (context.course || context.activity) void navigate({ to: '.', search: {}, replace: true })
  }
  return (
    <DetailPage back={back} title={name} meta={<ConversationMeta peer={peer} shared={head.shared_courses[0]} />}>
      <div className="flex flex-col gap-gutter">
        {query.hasNextPage ? (
          <div className="flex justify-center">
            <SubmitButton variant="ghost" pending={query.isFetchingNextPage} onClick={() => void earlier()}>
              {m.conversations_earlier()}
            </SubmitButton>
          </div>
        ) : null}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{m.conversations_no_messages()}</p> : null}
        {/* The live region wraps the list: `role="log"` on the <ol> itself would take its list semantics away. */}
        <div role="log" aria-live={quiet ? 'off' : 'polite'} aria-label={m.conversations_feed_label()}>
          <ol ref={feed} className="flex flex-col">
            <FeedRows rows={rows} peerName={name} peerAvatar={peer.avatar_key} />
          </ol>
        </div>
        <div className="sticky bottom-0 border-t bg-background py-3">
          {head.allowed_actions.includes('send') ? (
            <Composer to={peer.id} context={context} onSent={sent} />
          ) : (
            <p className="text-sm text-muted-foreground">{denyText[head.deny_reason ?? 'no_relation']()}</p>
          )}
        </div>
      </div>
    </DetailPage>
  )
}
