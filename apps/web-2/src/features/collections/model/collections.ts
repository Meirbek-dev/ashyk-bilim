import * as v from 'valibot'

import { ApiError } from '#/shared/api/errors'
import type { Collection, CollectionAction } from '#/shared/api/gen/types.gen'

/** /collections?q=: the name search. Blank is no search, so "?q=" and "/collections" are the same list. */
export const collectionsSearchSchema = v.object({
  q: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.transform(text => text || undefined),
    ),
  ),
})

/** The search box's own form value (the box is a form so Enter submits; the URL is the source of truth). */
export const searchBoxSchema = v.object({ q: v.string() })

/** `search` answers at most this many collection hits, without a cursor. */
export const SEARCH_LIMIT = 50

export const can = (collection: Pick<Collection, 'allowed_actions'>, action: CollectionAction): boolean =>
  collection.allowed_actions.includes(action)

/** A 412: someone saved the collection after this page loaded it (its `version` is stale). */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412
