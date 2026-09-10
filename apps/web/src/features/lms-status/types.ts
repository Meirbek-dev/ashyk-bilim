export const LmsStatuses = {
  READY: 'ready',
  NEEDS_ATTENTION: 'needs_attention',
  BLOCKED: 'blocked',
  IN_PROGRESS: 'in_progress',
  NO_WORK: 'no_work',
  LIMITED: 'limited',
  UNAVAILABLE: 'unavailable',
  PUBLISHED: 'published',
  PRIVATE: 'private',
  DRAFT: 'draft',
  UNSAVED: 'unsaved',
} as const

export type LmsStatus = (typeof LmsStatuses)[keyof typeof LmsStatuses]

export type LmsStatusTone = 'neutral' | 'success' | 'warning' | 'destructive'

export interface LmsStatusModel {
  status: LmsStatus
  /** Key into the `LmsStatus` message namespace (src/messages/*.json). Not display text. */
  labelKey: string
  description: string
  tone: LmsStatusTone
  sortOrder: number
}

export const LMS_STATUS_MODELS = {
  [LmsStatuses.READY]: {
    status: LmsStatuses.READY,
    labelKey: 'ready',
    description: 'The work can start now.',
    tone: 'success',
    sortOrder: 10,
  },
  [LmsStatuses.NEEDS_ATTENTION]: {
    status: LmsStatuses.NEEDS_ATTENTION,
    labelKey: 'needsAttention',
    description: 'A person should review this work soon.',
    tone: 'warning',
    sortOrder: 20,
  },
  [LmsStatuses.BLOCKED]: {
    status: LmsStatuses.BLOCKED,
    labelKey: 'blocked',
    description: 'Required setup, permission, or data is missing.',
    tone: 'destructive',
    sortOrder: 30,
  },
  [LmsStatuses.IN_PROGRESS]: {
    status: LmsStatuses.IN_PROGRESS,
    labelKey: 'inProgress',
    description: 'Work has started and can continue.',
    tone: 'neutral',
    sortOrder: 40,
  },
  [LmsStatuses.NO_WORK]: {
    status: LmsStatuses.NO_WORK,
    labelKey: 'noWork',
    description: 'There is nothing queued for this role.',
    tone: 'neutral',
    sortOrder: 50,
  },
  [LmsStatuses.LIMITED]: {
    status: LmsStatuses.LIMITED,
    labelKey: 'limited',
    description: 'The role can open the area, but dashboard data is incomplete.',
    tone: 'warning',
    sortOrder: 60,
  },
  [LmsStatuses.UNAVAILABLE]: {
    status: LmsStatuses.UNAVAILABLE,
    labelKey: 'unavailable',
    description: 'The source could not return dashboard work.',
    tone: 'destructive',
    sortOrder: 70,
  },
  [LmsStatuses.PUBLISHED]: {
    status: LmsStatuses.PUBLISHED,
    labelKey: 'published',
    description: 'Learners can access this item.',
    tone: 'success',
    sortOrder: 80,
  },
  [LmsStatuses.PRIVATE]: {
    status: LmsStatuses.PRIVATE,
    labelKey: 'private',
    description: 'Learners cannot access this item.',
    tone: 'neutral',
    sortOrder: 90,
  },
  [LmsStatuses.DRAFT]: {
    status: LmsStatuses.DRAFT,
    labelKey: 'draft',
    description: 'The item is not ready for learners.',
    tone: 'neutral',
    sortOrder: 100,
  },
  [LmsStatuses.UNSAVED]: {
    status: LmsStatuses.UNSAVED,
    labelKey: 'unsaved',
    description: 'Local changes have not been saved.',
    tone: 'warning',
    sortOrder: 110,
  },
} satisfies Record<LmsStatus, LmsStatusModel>

export function getLmsStatusModel(status: LmsStatus): LmsStatusModel {
  return LMS_STATUS_MODELS[status]
}

/**
 * Resolves the localized badge label for a status. `types.ts` is a plain module and
 * cannot call `useTranslations` itself, so callers thread their translator through —
 * same pattern as `WorkQueueTranslate` in `features/work-queue/dashboard-work-queue.ts`.
 */
export function getLmsStatusLabel(status: LmsStatus, t: (key: string) => string): string {
  return t(LMS_STATUS_MODELS[status].labelKey)
}
