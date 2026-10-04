import type { InfiniteData } from '@tanstack/react-query'

import { extractPlainText } from '#/features/editor'
import type { Discussion, DiscussionId, DiscussionPage, ReactionState } from '#/shared/api/gen/types.gen'

/**
 * A post or reply has text a reader can see. The server counts any non-tag character, so an empty editor document
 * (`{"type":"doc",...}`) would pass there: the form checks the document's own text.
 */
export const hasText = (content: string): boolean => extractPlainText(content).trim().length > 0

type Pages = InfiniteData<DiscussionPage> | undefined

const mapItems = (data: Pages, change: (items: Discussion[], index: number) => Discussion[]): Pages =>
  data && { ...data, pages: data.pages.map((page, index) => ({ ...page, items: change(page.items, index) })) }

/** A new post goes first: the list is newest first and the keyset cursor of later pages stays valid. */
export const prependItem = (data: Pages, post: Discussion): Pages =>
  mapItems(data, (items, index) => (index === 0 ? [post, ...items] : items))

/**
 * A new reply goes last (replies are oldest first). While more pages wait behind "Show more", it is not placed:
 * it arrives in order with the last page.
 */
export const appendItem = (data: Pages, reply: Discussion): Pages => {
  const last = (data?.pages.length ?? 0) - 1
  if (!data || data.pages[last]?.next_cursor) return data
  return mapItems(data, (items, index) => (index === last ? [...items, reply] : items))
}

/** The server's answer to an edit or a status change replaces the cached item. */
export const replaceItem = (data: Pages, next: Discussion): Pages =>
  mapItems(data, items => items.map(item => (item.id === next.id ? { ...next, replies: item.replies } : item)))

export const removeItem = (data: Pages, id: DiscussionId): Pages =>
  mapItems(data, items => items.filter(item => item.id !== id))

/** A reply's create answer carries its post's new `replies_count`: the post takes it without a list re-read. */
export const setRepliesCount = (data: Pages, id: DiscussionId, count: number): Pages =>
  mapItems(data, items => items.map(item => (item.id === id ? { ...item, replies_count: count } : item)))

/** One post (a deep-linked thread) through the list changes above: a removed post becomes `null`. */
export const changePost = (post: Discussion, change: (data: Pages) => Pages): Discussion | null =>
  change({ pages: [{ items: [post], next_cursor: null }], pageParams: [undefined] })?.pages[0]?.items[0] ?? null

/** Like / dislike: counts and pressed state exactly as the toggle answered. */
export const applyReaction = (data: Pages, id: DiscussionId, state: ReactionState): Pages =>
  mapItems(data, items => items.map(item => (item.id === id ? { ...item, ...state } : item)))
