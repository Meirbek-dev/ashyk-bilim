import type { LmsStatus } from '@/features/lms-status'

export type WorkQueueAudience = 'learner' | 'teacher' | 'admin'
export type WorkQueuePriority = 'critical' | 'high' | 'normal' | 'low'
export type WorkQueueSource =
  | 'learner-learning'
  | 'course-management'
  | 'teacher-analytics'
  | 'admin-analytics'
  | 'ai-admin'
  | 'access-control'
  | 'account'

export interface WorkQueueMetric {
  value: number
  label: string
}

export interface WorkQueueItem {
  id: string
  audience: WorkQueueAudience
  title: string
  description: string
  href: string
  primaryActionLabel: string
  source: WorkQueueSource
  sourceLabel: string
  status: LmsStatus
  priority: WorkQueuePriority
  metric?: WorkQueueMetric
}

export interface WorkQueueSection {
  audience: WorkQueueAudience
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  items: WorkQueueItem[]
}

export interface DashboardToolItem {
  id: string
  title: string
  description: string
  href: string
  audience: WorkQueueAudience | 'all'
  badge?: string
}
