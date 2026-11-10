import { useMutation, type UseSuspenseInfiniteQueryResult, type InfiniteData } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { ApiError } from '#/shared/api/errors'
import type { MessagePage } from '#/shared/api/gen/types.gen'

import { isAfter } from '../model/feed'
import { markReadOptions } from '../queries'

type Feed = UseSuspenseInfiniteQueryResult<InfiniteData<MessagePage>, ApiError>

/**
 * The feed's scrolling (docs/DIALOGS.md 9): it opens at the first unread message, else at the end; «Показать более
 * ранние» keeps the message read last in view and stays out of the live region (`quiet`), so history is not read
 * aloud as if it had just arrived.
 */
export function useFeedScroll(query: Feed) {
  const feed = useRef<HTMLOListElement>(null)
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    const list = feed.current
    const target = list?.querySelector('[data-new]') ?? list?.lastElementChild
    target?.scrollIntoView({ block: 'center' })
  }, [])
  const earlier = async () => {
    const anchor = feed.current?.querySelector('[data-message]')
    setQuiet(true)
    await query.fetchNextPage()
    anchor?.scrollIntoView({ block: 'start' })
    setQuiet(false)
  }
  return { feed, quiet, earlier }
}

/**
 * The read pointer follows the newest message while the tab is visible (a hidden tab reads nothing until it is
 * shown again); it moves only forward, and one request per message.
 */
export function useMarkRead(conversationId: string, newest: string | null, serverRead: string | null) {
  const { mutate } = useMutation(markReadOptions())
  const sent = useRef<string | null>(null)
  useEffect(() => {
    const read = () => {
      if (document.visibilityState !== 'visible' || newest === null) return
      if (!isAfter(newest, serverRead) || !isAfter(newest, sent.current)) return
      sent.current = newest
      mutate({ path: { conversation_id: conversationId }, body: { last_read_message_id: newest } })
    }
    read()
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [conversationId, newest, serverRead, mutate])
}
