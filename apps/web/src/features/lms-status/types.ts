export const LmsStatuses = {
  READY: 'ready',
  NEEDS_ATTENTION: 'needs_attention',
  BLOCKED: 'blocked',
  IN_PROGRESS: 'in_progress',
  NO_WORK: 'no_work',
  LIMITED: 'limited',
  UNAVAILABLE: 'unavailable',
} as const

export type LmsStatus = (typeof LmsStatuses)[keyof typeof LmsStatuses]

export type LmsStatusTone = 'neutral' | 'success' | 'warning' | 'destructive'

export interface LmsStatusModel {
  status: LmsStatus
  label: string
  description: string
  tone: LmsStatusTone
  sortOrder: number
}

export const LMS_STATUS_MODELS = {
  [LmsStatuses.READY]: {
    status: LmsStatuses.READY,
    label: 'Ready',
    description: 'The work can start now.',
    tone: 'success',
    sortOrder: 10,
  },
  [LmsStatuses.NEEDS_ATTENTION]: {
    status: LmsStatuses.NEEDS_ATTENTION,
    label: 'Needs Attention',
    description: 'A person should review this work soon.',
    tone: 'warning',
    sortOrder: 20,
  },
  [LmsStatuses.BLOCKED]: {
    status: LmsStatuses.BLOCKED,
    label: 'Blocked',
    description: 'Required setup, permission, or data is missing.',
    tone: 'destructive',
    sortOrder: 30,
  },
  [LmsStatuses.IN_PROGRESS]: {
    status: LmsStatuses.IN_PROGRESS,
    label: 'In Progress',
    description: 'Work has started and can continue.',
    tone: 'neutral',
    sortOrder: 40,
  },
  [LmsStatuses.NO_WORK]: {
    status: LmsStatuses.NO_WORK,
    label: 'No Work',
    description: 'There is nothing queued for this role.',
    tone: 'neutral',
    sortOrder: 50,
  },
  [LmsStatuses.LIMITED]: {
    status: LmsStatuses.LIMITED,
    label: 'Limited',
    description: 'The role can open the area, but dashboard data is incomplete.',
    tone: 'warning',
    sortOrder: 60,
  },
  [LmsStatuses.UNAVAILABLE]: {
    status: LmsStatuses.UNAVAILABLE,
    label: 'Unavailable',
    description: 'The source could not return dashboard work.',
    tone: 'destructive',
    sortOrder: 70,
  },
} satisfies Record<LmsStatus, LmsStatusModel>

export function getLmsStatusModel(status: LmsStatus): LmsStatusModel {
  return LMS_STATUS_MODELS[status]
}
