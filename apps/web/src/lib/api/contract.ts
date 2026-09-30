/**
 * Small helpers for v2 contract conventions shared by every feature:
 * keyset pages, epoch-second timestamps and UUID ids.
 */

/** Keyset page (ARCHITECTURE §6): pass `next_cursor` back as `cursor`. */
export interface Page<T> {
  items: T[]
  next_cursor?: string | null | undefined
}

export function emptyPage<T>(): Page<T> {
  return { items: [], next_cursor: null }
}

/**
 * Walk a keyset listing to the end — every cursor is followed, so callers get
 * the whole list (BUG-352: a 20-page cap silently dropped the rest). A cursor
 * seen twice is a server loop: an error, never a quietly truncated list.
 */
export async function collectPages<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  for (;;) {
    const page: Page<T> = await fetchPage(cursor)
    items.push(...page.items)
    if (!page.next_cursor) return items
    if (seen.has(page.next_cursor)) throw new Error(`Keyset listing repeated cursor ${page.next_cursor}`)
    seen.add(page.next_cursor)
    cursor = page.next_cursor
  }
}

/** Convert an epoch-seconds `*_unix` value to a `Date` (`null` stays `null`). */
export function fromUnix(seconds: number): Date
export function fromUnix(seconds: number | null | undefined): Date | null
export function fromUnix(seconds: number | null | undefined): Date | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000)
}

/** Convert a `Date` / ISO string / epoch-milliseconds value to epoch seconds. */
export function toUnix(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value > 1e12 ? value / 1000 : value) : null
  const date = value instanceof Date ? value : new Date(value)
  const millis = date.getTime()
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : null
}

/** ISO-8601 string for an epoch-seconds value (for components that still format ISO). */
export function unixToIso(seconds: number | null | undefined): string | null {
  const date = fromUnix(seconds)
  return date ? date.toISOString() : null
}
