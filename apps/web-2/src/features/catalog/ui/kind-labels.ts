import { m } from '#/paraglide/messages'

import type { SearchKind } from '../model/catalog'

/** The section names of a `search` answer: the search page's tabs and sections, and the palette's groups. */
export const searchKindLabels = {
  courses: m.catalog_search_kind_courses,
  collections: m.catalog_search_kind_collections,
  users: m.catalog_search_kind_users,
} satisfies Record<SearchKind, () => string>
