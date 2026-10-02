import { m } from '#/paraglide/messages'
import type { CollectionAction } from '#/shared/api/gen/types.gen'

// Spec 7.9: every enum the UI renders has one exhaustive map here. A new value in the contract without a text is a
// type error at the map, not a raw value on screen. Status badges add their tone next to the label (DESIGN 8).

/** `public: boolean` of a collection, as the two states a badge names. */
export type CollectionVisibility = 'public' | 'private'

export const collectionVisibilityLabels = {
  public: m.collections_visibility_public,
  private: m.collections_visibility_private,
} satisfies Record<CollectionVisibility, () => string>

export const collectionVisibility = (collection: { public: boolean }): CollectionVisibility =>
  collection.public ? 'public' : 'private'

export const collectionActionLabels = {
  update: m.collections_action_update,
  delete: m.collections_action_delete,
} satisfies Record<CollectionAction, () => string>
