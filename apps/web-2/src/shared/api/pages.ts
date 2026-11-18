import { listGroups } from './gen/sdk.gen'

/**
 * Every page of a keyset list merged into one page, for pickers that must not drop rows past the first page.
 * Stops after `maxPages`; the answer then keeps the cursor it stopped at.
 */
export async function allPages<P extends { items: unknown[]; next_cursor: string | null }>(
  read: (cursor: string | undefined) => Promise<P>,
  maxPages = 20,
): Promise<P> {
  const first = await read(undefined)
  const items = [...first.items]
  let cursor = first.next_cursor
  for (let page = 1; cursor && page < maxPages; page += 1) {
    const next = await read(cursor)
    items.push(...next.items)
    cursor = next.next_cursor
  }
  return { ...first, items, next_cursor: cursor }
}

/** Every group the caller can see (the group pickers filter them by permission). */
export const allGroups = (signal: AbortSignal) =>
  allPages(async cursor => {
    const query = { limit: 100, ...(cursor ? { cursor } : {}) }
    return (await listGroups({ query, signal, throwOnError: true })).data
  })
