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

/** Walk a keyset listing to the end (bounded by `maxPages`, default 20). */
export async function collectPages<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  maxPages = 20,
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  for (let index = 0; index < maxPages; index += 1) {
    const page: Page<T> = await fetchPage(cursor)
    items.push(...page.items)
    if (!page.next_cursor) break
    cursor = page.next_cursor
  }
  return items
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** True for a v2 entity id (UUID string). */
export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
