import {
  ClipboardCheck,
  CodeXml,
  FileText,
  FileUp,
  ListChecks,
  NotebookText,
  Puzzle,
  Video,
  type LucideIcon,
} from 'lucide-react'

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

/**
 * The closed activity-type set of the server (`TYPE_SUBTYPES` in the catalog; the contract types it as a string).
 * `custom` has no row in DESIGN 3: it borrows the page token with its own icon.
 */
export type ActivityType =
  | 'dynamic'
  | 'video'
  | 'document'
  | 'file_submission'
  | 'quiz'
  | 'exam'
  | 'code_challenge'
  | 'custom'

/** DESIGN 3: the one table that maps an activity type to its icon, label and color token (icon ink only). */
export const activityTypeMeta = {
  dynamic: { icon: NotebookText, label: m.activity_type_dynamic, ink: 'text-activity-page' },
  video: { icon: Video, label: m.activity_type_video, ink: 'text-activity-video' },
  document: { icon: FileText, label: m.activity_type_document, ink: 'text-activity-document' },
  file_submission: { icon: FileUp, label: m.activity_type_file_submission, ink: 'text-activity-file-submission' },
  quiz: { icon: ListChecks, label: m.activity_type_quiz, ink: 'text-activity-quiz' },
  exam: { icon: ClipboardCheck, label: m.activity_type_exam, ink: 'text-activity-exam' },
  code_challenge: { icon: CodeXml, label: m.activity_type_code_challenge, ink: 'text-activity-code' },
  custom: { icon: Puzzle, label: m.activity_type_custom, ink: 'text-activity-page' },
} satisfies Record<ActivityType, { icon: LucideIcon; label: () => string; ink: string }>

const isActivityType = (value: string): value is ActivityType => Object.hasOwn(activityTypeMeta, value)

/** The contract's `activity_type` string as a known type; a value the table does not know reads as `custom`. */
export const activityType = (value: string): ActivityType => (isActivityType(value) ? value : 'custom')

export const collectionActionLabels = {
  update: m.collections_action_update,
  delete: m.collections_action_delete,
} satisfies Record<CollectionAction, () => string>
