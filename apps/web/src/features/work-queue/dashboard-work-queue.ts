import { LmsStatuses } from '@/features/lms-status'

import type { DashboardToolItem, WorkQueueItem, WorkQueueSection } from './types'

interface DashboardAccess {
  hasCoursesAccess: boolean
  hasAnalyticsAccess: boolean
  hasUsersAccess: boolean
  hasAdminAccess: boolean
}

interface EditableCourseSummary {
  total: number
  ready: number
  private: number
  attention: number
  signalAvailable: boolean
  errorMessage?: string | null
}

interface TeacherDashboardSignal {
  atRiskTotal: number
  gradingBacklogTotal: number
  slaBreaches: number
  forecastBacklog7d: number
  medianFeedbackLatencyHours: number | null
  backlogItems: {
    assessmentId: number
    awaitingReview: number
    courseName: string
    title: string
    slaBreaches: number
  }[]
  signalAvailable: boolean
  errorMessage?: string | null
  workItems?: LearnerDashboardSignal['items']
}

interface AdminDashboardSignal {
  aiMonthlyBudget: number | null
  aiRemainingBudget: number | null
  teacherBacklogTotal: number
  teacherSlaBreaches: number
  signalAvailable: boolean
  errorMessage?: string | null
}

export interface LearnerDashboardSignal {
  items: {
    id: string
    kind: string
    status: string
    priority: WorkQueueItem['priority']
    title: string
    description: string
    href: string
    primary_action: string
    due_at?: string | null
    created_at?: string | null
    groupLabel?: string
  }[]
  signalAvailable: boolean
}

interface DashboardWorkQueueInput {
  access: DashboardAccess
  courseSummary: EditableCourseSummary | null
  teacherSignal: TeacherDashboardSignal | null
  adminSignal: AdminDashboardSignal | null
  learnerSignal: LearnerDashboardSignal | null
}

export interface DashboardWorkQueueModel {
  sections: WorkQueueSection[]
  tools: DashboardToolItem[]
}

const countMetric = (value: number, label: string) => ({
  value,
  label,
})

export function buildDashboardWorkQueue({
  access,
  courseSummary,
  teacherSignal,
  adminSignal,
  learnerSignal,
}: DashboardWorkQueueInput): DashboardWorkQueueModel {
  const teacherSection = buildTeacherSection({ access, courseSummary, teacherSignal })
  const adminSection = buildAdminSection({ access, adminSignal })
  const sections: WorkQueueSection[] = []

  if (access.hasCoursesAccess || access.hasAnalyticsAccess) {
    sections.push(teacherSection)
  }

  if (access.hasUsersAccess || access.hasAdminAccess) {
    sections.push(adminSection)
  }

  if (sections.length === 0) {
    sections.push(buildLearnerSection(learnerSignal))
  }

  return {
    sections,
    tools: buildDashboardTools(access),
  }
}

function buildLearnerSection(signal: LearnerDashboardSignal | null): WorkQueueSection {
  return {
    audience: 'learner',
    title: 'Learner Work',
    description: 'Assignments and course actions that need the learner next.',
    emptyTitle: 'No learner work is queued',
    emptyDescription: 'You are caught up. Browse a course when you are ready to continue learning.',
    items: signal?.signalAvailable
      ? sortWorkQueueItems(
          signal.items.map(item => ({
            id: item.id,
            audience: 'learner',
            title: item.title,
            description: item.description,
            href: item.href,
            primaryActionLabel: item.primary_action,
            source: 'learner-learning',
            sourceLabel: 'Learning',
            status: learnerQueueStatus(item.kind, item.status),
            priority: item.priority,
            ...(item.due_at ? { dueAt: item.due_at } : {}),
            ...(item.created_at ? { createdAt: item.created_at } : {}),
            ...(item.groupLabel ? { groupLabel: item.groupLabel } : {}),
          })),
        )
      : [
          {
            id: 'learner-work-unavailable',
            audience: 'learner',
            title: 'Check learning work',
            description: 'Your learning queue could not be loaded. Open Courses to continue directly.',
            href: '/courses',
            primaryActionLabel: 'Browse Courses',
            source: 'learner-learning',
            sourceLabel: 'Learning',
            status: LmsStatuses.UNAVAILABLE,
            priority: 'normal',
          },
        ],
  }
}

function learnerQueueStatus(kind: string, status: string) {
  if (kind === 'returned_for_revision' || kind === 'overdue' || status === 'failed') return LmsStatuses.NEEDS_ATTENTION
  if (kind === 'feedback_released') return LmsStatuses.PUBLISHED
  return LmsStatuses.IN_PROGRESS
}

interface TeacherSectionInput {
  access: DashboardAccess
  courseSummary: EditableCourseSummary | null
  teacherSignal: TeacherDashboardSignal | null
}

function buildTeacherSection({ access, courseSummary, teacherSignal }: TeacherSectionInput): WorkQueueSection {
  const items: WorkQueueItem[] = []

  teacherSignal?.workItems?.forEach(item => {
    items.push({
      id: item.id,
      audience: 'teacher',
      title: item.title,
      description: item.description,
      href: item.href,
      primaryActionLabel: item.primary_action,
      source: 'course-management',
      sourceLabel: 'Grading Queue',
      status: item.priority === 'critical' ? LmsStatuses.NEEDS_ATTENTION : LmsStatuses.READY,
      priority: item.priority,
      ...(item.due_at ? { dueAt: item.due_at } : {}),
      ...(item.created_at ? { createdAt: item.created_at } : {}),
      ...(item.groupLabel ? { groupLabel: item.groupLabel } : {}),
    })
  })

  if (access.hasCoursesAccess && courseSummary?.signalAvailable) {
    if (courseSummary.attention > 0) {
      items.push({
        id: 'course-readiness',
        audience: 'teacher',
        title: 'Review course readiness',
        description: 'Draft, private, or incomplete courses need teacher review before learners rely on them.',
        href: '/dash/courses?preset=attention',
        primaryActionLabel: 'Open Courses',
        source: 'course-management',
        sourceLabel: 'Course Management',
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'high',
        metric: countMetric(courseSummary.attention, 'courses'),
      })
    }

    if (courseSummary.total === 0) {
      items.push({
        id: 'create-first-course',
        audience: 'teacher',
        title: 'Create the first course',
        description: 'The teaching workspace has no editable courses yet.',
        href: '/dash/courses/new',
        primaryActionLabel: 'Create Course',
        source: 'course-management',
        sourceLabel: 'Course Management',
        status: LmsStatuses.READY,
        priority: 'normal',
      })
    }
  }

  if (access.hasCoursesAccess && (!courseSummary || !courseSummary.signalAvailable)) {
    items.push({
      id: 'courses-unavailable',
      audience: 'teacher',
      title: 'Check courses feed',
      description: 'Course management is available, but its summary could not be loaded. Open Courses to retry.',
      href: '/dash/courses',
      primaryActionLabel: 'Open Courses',
      source: 'course-management',
      sourceLabel: 'Course Management',
      status: LmsStatuses.UNAVAILABLE,
      priority: 'normal',
    })
  }

  if (access.hasAnalyticsAccess && teacherSignal?.signalAvailable) {
    if (teacherSignal.slaBreaches > 0) {
      items.push({
        id: 'grading-sla-breaches',
        audience: 'teacher',
        title: 'Fix grading SLA breaches',
        description: formatFeedbackLatencyDescription(teacherSignal.medianFeedbackLatencyHours),
        href: '/dash/analytics/assessments',
        primaryActionLabel: 'Open SLA Queue',
        source: 'teacher-analytics',
        sourceLabel: 'Teacher Analytics',
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'critical',
        metric: countMetric(teacherSignal.slaBreaches, 'breaches'),
      })
    }

    if (teacherSignal.gradingBacklogTotal > 0) {
      items.push({
        id: 'grading-backlog',
        audience: 'teacher',
        title: 'Grade pending submissions',
        description: 'Manual assessment work is waiting for review and feedback.',
        href: '/dash/analytics/assessments',
        primaryActionLabel: 'Open Grading',
        source: 'teacher-analytics',
        sourceLabel: 'Teacher Analytics',
        status: teacherSignal.slaBreaches > 0 ? LmsStatuses.NEEDS_ATTENTION : LmsStatuses.READY,
        priority: teacherSignal.slaBreaches > 0 ? 'critical' : 'high',
        metric: countMetric(teacherSignal.gradingBacklogTotal, 'submissions'),
      })
    }

    teacherSignal.backlogItems.slice(0, 3).forEach(item => {
      items.push({
        id: `manual-assessment-${item.assessmentId}`,
        audience: 'teacher',
        title: item.title,
        description: `${item.courseName} has manual submissions waiting for review.`,
        href: `/dash/analytics/assessments/manual_assessment/${item.assessmentId}`,
        primaryActionLabel: 'Open Assessment',
        source: 'teacher-analytics',
        sourceLabel: 'Cross-Course Queue',
        status: item.slaBreaches > 0 ? LmsStatuses.NEEDS_ATTENTION : LmsStatuses.READY,
        priority: item.slaBreaches > 0 ? 'critical' : 'high',
        metric: countMetric(item.awaitingReview, 'awaiting review'),
      })
    })

    if (teacherSignal.forecastBacklog7d > teacherSignal.gradingBacklogTotal) {
      items.push({
        id: 'forecast-grading-load',
        audience: 'teacher',
        title: 'Plan the 7-day grading load',
        description: 'Forecasted submissions exceed the current backlog.',
        href: '/dash/analytics/assessments',
        primaryActionLabel: 'Open Forecast',
        source: 'teacher-analytics',
        sourceLabel: 'Teacher Analytics',
        status: LmsStatuses.IN_PROGRESS,
        priority: 'normal',
        metric: countMetric(teacherSignal.forecastBacklog7d, 'forecast'),
      })
    }

    if (teacherSignal.atRiskTotal > 0) {
      items.push({
        id: 'learner-risk',
        audience: 'teacher',
        title: 'Intervene with at-risk learners',
        description: 'Learners with stalled progress or assessment blocks need action.',
        href: '/dash/analytics/learners/at-risk',
        primaryActionLabel: 'Open Watchlist',
        source: 'teacher-analytics',
        sourceLabel: 'Teacher Analytics',
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'high',
        metric: countMetric(teacherSignal.atRiskTotal, 'learners'),
      })
    }
  }

  if (access.hasAnalyticsAccess && teacherSignal && !teacherSignal.signalAvailable) {
    items.push({
      id: 'teacher-analytics-unavailable',
      audience: 'teacher',
      title: 'Check analytics feed',
      description: 'Teacher analytics could not be loaded. Open Analytics to retry.',
      href: '/dash/analytics',
      primaryActionLabel: 'Open Analytics',
      source: 'teacher-analytics',
      sourceLabel: 'Teacher Analytics',
      status: LmsStatuses.UNAVAILABLE,
      priority: 'normal',
    })
  }

  return {
    audience: 'teacher',
    title: 'Teacher Work',
    description: 'Course readiness, grading, and learner intervention work.',
    emptyTitle: 'No teacher work is queued',
    emptyDescription: 'Courses, grading backlog, and learner risk checks will appear here when they need action.',
    items: sortWorkQueueItems(items),
  }
}

function formatFeedbackLatencyDescription(hours: number | null): string {
  if (hours === null) return 'Feedback is missing the target response window.'
  if (hours < 24) return `Median feedback latency is ${Math.round(hours)} hours.`
  return `Median feedback latency is ${Math.round(hours / 24)} days.`
}

interface AdminSectionInput {
  access: DashboardAccess
  adminSignal: AdminDashboardSignal | null
}

function buildAdminSection({ access, adminSignal }: AdminSectionInput): WorkQueueSection {
  const items: WorkQueueItem[] = []

  if (access.hasAdminAccess && adminSignal?.signalAvailable) {
    const aiBudgetUsage = getAiBudgetUsage(adminSignal)
    if (aiBudgetUsage !== null && aiBudgetUsage >= 90) {
      items.push({
        id: 'admin-ai-budget-critical',
        audience: 'admin',
        title: 'Review AI budget before requests fail',
        description: `AI usage has consumed ${aiBudgetUsage}% of the monthly token budget.`,
        href: '/dash/admin',
        primaryActionLabel: 'Open AI Admin',
        source: 'ai-admin',
        sourceLabel: 'AI Operations',
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'critical',
        metric: countMetric(aiBudgetUsage, '% used'),
      })
    } else if (aiBudgetUsage !== null && aiBudgetUsage >= 75) {
      items.push({
        id: 'admin-ai-budget-warning',
        audience: 'admin',
        title: 'Plan AI budget usage',
        description: `AI usage is at ${aiBudgetUsage}% of the monthly token budget.`,
        href: '/dash/admin',
        primaryActionLabel: 'Open AI Admin',
        source: 'ai-admin',
        sourceLabel: 'AI Operations',
        status: LmsStatuses.IN_PROGRESS,
        priority: 'high',
        metric: countMetric(aiBudgetUsage, '% used'),
      })
    }
  }

  if (access.hasAdminAccess && adminSignal?.signalAvailable && adminSignal.teacherSlaBreaches > 0) {
    items.push({
      id: 'admin-workload-hotspots',
      audience: 'admin',
      title: 'Review teacher workload hotspots',
      description: 'Teacher workload has SLA breaches that need operations review.',
      href: '/dash/analytics/admin',
      primaryActionLabel: 'Open Admin Analytics',
      source: 'admin-analytics',
      sourceLabel: 'Admin Analytics',
      status: LmsStatuses.NEEDS_ATTENTION,
      priority: 'critical',
      metric: countMetric(adminSignal.teacherSlaBreaches, 'breaches'),
    })
  }

  if (access.hasAdminAccess && adminSignal?.signalAvailable && adminSignal.teacherBacklogTotal > 0) {
    items.push({
      id: 'admin-teacher-backlog',
      audience: 'admin',
      title: 'Inspect teacher backlog',
      description: 'Workload is accumulating across managed courses.',
      href: '/dash/analytics/admin',
      primaryActionLabel: 'Open Workload',
      source: 'admin-analytics',
      sourceLabel: 'Admin Analytics',
      status: LmsStatuses.READY,
      priority: 'high',
      metric: countMetric(adminSignal.teacherBacklogTotal, 'submissions'),
    })
  }

  if (access.hasUsersAccess) {
    items.push({
      id: 'user-access-audit',
      audience: 'admin',
      title: 'Audit user access',
      description: 'Review users and groups before expanding course or analytics permissions.',
      href: '/dash/users/settings/users',
      primaryActionLabel: 'Open Users',
      source: 'access-control',
      sourceLabel: 'Access Control',
      status: LmsStatuses.READY,
      priority: 'normal',
    })
  }

  if (access.hasAdminAccess) {
    items.push({
      id: 'role-policy-review',
      audience: 'admin',
      title: 'Review role policy',
      description: 'Keep system roles aligned with the learner, teacher, and admin dashboard model.',
      href: '/dash/admin/roles',
      primaryActionLabel: 'Open Roles',
      source: 'access-control',
      sourceLabel: 'Access Control',
      status: LmsStatuses.READY,
      priority: 'normal',
    })
  }

  if (access.hasAdminAccess && adminSignal && !adminSignal.signalAvailable) {
    items.push({
      id: 'admin-analytics-unavailable',
      audience: 'admin',
      title: 'Check admin analytics feed',
      description: 'Admin workload signals could not be loaded. Open Admin Analytics to retry.',
      href: '/dash/analytics/admin',
      primaryActionLabel: 'Open Admin Analytics',
      source: 'admin-analytics',
      sourceLabel: 'Admin Analytics',
      status: LmsStatuses.UNAVAILABLE,
      priority: 'normal',
    })
  }

  return {
    audience: 'admin',
    title: 'Admin Work',
    description: 'Access, policy, and operational work for the platform.',
    emptyTitle: 'No admin work is queued',
    emptyDescription: 'Access reviews and operations signals will appear here when your role can act on them.',
    items: sortWorkQueueItems(items),
  }
}

function getAiBudgetUsage(adminSignal: AdminDashboardSignal): number | null {
  if (adminSignal.aiMonthlyBudget === null || adminSignal.aiRemainingBudget === null) return null
  if (adminSignal.aiMonthlyBudget <= 0) return null
  const used = adminSignal.aiMonthlyBudget - adminSignal.aiRemainingBudget
  return Math.max(0, Math.min(100, Math.round((used / adminSignal.aiMonthlyBudget) * 100)))
}

function buildDashboardTools(access: DashboardAccess): DashboardToolItem[] {
  const tools: DashboardToolItem[] = [
    {
      id: 'browse-courses',
      title: 'Browse Courses',
      description: 'Find published learning content.',
      href: '/courses',
      audience: 'learner',
    },
    {
      id: 'courses',
      title: 'Courses',
      description: 'Create and manage courses, chapters, and assessment tasks.',
      href: '/dash/courses',
      audience: 'teacher',
    },
    {
      id: 'analytics',
      title: 'Analytics',
      description: 'Open learner, course, and assessment analytics.',
      href: '/dash/analytics',
      audience: 'teacher',
    },
    {
      id: 'users',
      title: 'Users',
      description: 'Manage organization users and groups.',
      href: '/dash/users/settings/users',
      audience: 'admin',
    },
    {
      id: 'admin',
      title: 'Admin',
      description: 'Manage roles, AI operations, and platform policy.',
      href: '/dash/admin',
      audience: 'admin',
      badge: 'System',
    },
    {
      id: 'account',
      title: 'Account Settings',
      description: 'Update profile, security, and personal preferences.',
      href: '/dash/user-account/settings/general',
      audience: 'all',
    },
  ]

  return tools.filter(tool => {
    if (tool.audience === 'all' || tool.audience === 'learner') return true
    if (tool.audience === 'teacher') return access.hasCoursesAccess || access.hasAnalyticsAccess
    return access.hasUsersAccess || access.hasAdminAccess
  })
}

function sortWorkQueueItems(items: WorkQueueItem[]): WorkQueueItem[] {
  const priorityRank = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  } satisfies Record<WorkQueueItem['priority'], number>

  return [...items].toSorted((left, right) => priorityRank[left.priority] - priorityRank[right.priority])
}
