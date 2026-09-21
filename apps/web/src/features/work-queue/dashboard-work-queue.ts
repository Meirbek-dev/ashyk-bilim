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
    assessmentId: string
    awaitingReview: number
    courseName: string
    title: string
    slaBreaches: number
  }[]
  signalAvailable: boolean
  errorMessage?: string | null
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

/**
 * Translator for the `DashboardWorkQueue` message namespace. Matches the
 * `getTranslations('DashboardWorkQueue')` result shape already threaded into
 * `localizeWorkItem` by the caller in `dash/page.tsx`.
 */
export type WorkQueueTranslate = (key: string, values?: Record<string, string | number>) => string

interface DashboardWorkQueueInput {
  access: DashboardAccess
  courseSummary: EditableCourseSummary | null
  teacherSignal: TeacherDashboardSignal | null
  /** Grading queue (`work?role=teacher`): course management, not analytics. */
  teacherWorkItems?: LearnerDashboardSignal['items']
  adminSignal: AdminDashboardSignal | null
  learnerSignal: LearnerDashboardSignal | null
  t: WorkQueueTranslate
}

export interface DashboardWorkQueueModel {
  sections: WorkQueueSection[]
  tools: DashboardToolItem[]
}

export function buildDashboardWorkQueue({
  access,
  courseSummary,
  teacherSignal,
  teacherWorkItems,
  adminSignal,
  learnerSignal,
  t,
}: DashboardWorkQueueInput): DashboardWorkQueueModel {
  const teacherSection = buildTeacherSection({ access, courseSummary, teacherSignal, teacherWorkItems, t })
  const adminSection = buildAdminSection({ access, adminSignal, t })
  const sections: WorkQueueSection[] = []

  // UX-155: the section is the grading queue's — an analytics-only grant
  // gets the analytics tool card, not an empty «teacher work» list.
  if (access.hasCoursesAccess) {
    sections.push(teacherSection)
  }

  // Admin work only for admins: `hasUsersAccess` is also true for instructors
  // (`usergroup:read:platform`), and every item here lands on admin-only routes.
  if (access.hasAdminAccess) {
    sections.push(adminSection)
  }

  if (sections.length === 0) {
    sections.push(buildLearnerSection(learnerSignal, t))
  }

  return {
    sections,
    tools: buildDashboardTools(access, t),
  }
}

function buildLearnerSection(signal: LearnerDashboardSignal | null, t: WorkQueueTranslate): WorkQueueSection {
  return {
    audience: 'learner',
    title: t('sections.learner.title'),
    description: t('sections.learner.description'),
    emptyTitle: t('sections.learner.emptyTitle'),
    emptyDescription: t('sections.learner.emptyDescription'),
    items: signal?.signalAvailable
      ? sortWorkQueueItems(
          signal.items.map(item => {
            const groupLabel = learnerGroupLabel(item, t)
            return {
              id: item.id,
              audience: 'learner',
              title: item.title,
              description: item.description,
              href: item.href,
              primaryActionLabel: item.primary_action,
              source: 'learner-learning',
              sourceLabel: t('sourceLabels.learning'),
              status: learnerQueueStatus(item.kind, item.status),
              priority: item.priority,
              ...(item.due_at ? { dueAt: item.due_at } : {}),
              ...(item.created_at ? { createdAt: item.created_at } : {}),
              ...(groupLabel ? { groupLabel } : {}),
            }
          }),
        )
      : [
          {
            id: 'learner-work-unavailable',
            audience: 'learner',
            title: t('sections.learner.unavailable.title'),
            description: t('sections.learner.unavailable.description'),
            href: '/courses',
            primaryActionLabel: t('sections.learner.unavailable.action'),
            source: 'learner-learning',
            sourceLabel: t('sourceLabels.learning'),
            status: LmsStatuses.UNAVAILABLE,
            priority: 'normal',
          },
        ],
  }
}

/** «Скоро срок» only when there is a due date; a draft without one is just «in progress». */
function learnerGroupLabel(item: LearnerDashboardSignal['items'][number], t: WorkQueueTranslate) {
  switch (item.kind) {
    case 'returned_for_revision':
      return t('groups.returned')
    case 'waiting_for_grade':
      return t('groups.waiting')
    case 'feedback_released':
      return t('groups.released')
    case 'overdue':
      return t('groups.today')
    case 'in_progress':
      return item.due_at ? t('groups.dueSoon') : undefined
    default:
      return undefined
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
  teacherWorkItems: LearnerDashboardSignal['items'] | undefined
  t: WorkQueueTranslate
}

function buildTeacherSection({
  access,
  courseSummary,
  teacherSignal,
  teacherWorkItems,
  t,
}: TeacherSectionInput): WorkQueueSection {
  const items: WorkQueueItem[] = []

  // UX-151: every item and card is gated by its own grant (BUG-046 class) —
  // grading work lands on course routes an analytics-only grant cannot open.
  if (access.hasCoursesAccess)
    teacherWorkItems?.forEach(item => {
      items.push({
        id: item.id,
        audience: 'teacher',
        title: item.title,
        description: item.description,
        href: item.href,
        primaryActionLabel: item.primary_action,
        source: 'course-management',
        sourceLabel: t('sourceLabels.gradingQueue'),
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
        title: t('builderItems.courseReadiness.title'),
        description: t('builderItems.courseReadiness.description'),
        href: '/dash/courses?preset=attention',
        primaryActionLabel: t('builderItems.courseReadiness.action'),
        source: 'course-management',
        sourceLabel: t('sourceLabels.courseManagement'),
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'high',
        metric: t('metrics.courses', { count: courseSummary.attention }),
      })
    }

    if (courseSummary.total === 0) {
      items.push({
        id: 'create-first-course',
        audience: 'teacher',
        title: t('builderItems.createFirstCourse.title'),
        description: t('builderItems.createFirstCourse.description'),
        href: '/dash/courses/new',
        primaryActionLabel: t('builderItems.createFirstCourse.action'),
        source: 'course-management',
        sourceLabel: t('sourceLabels.courseManagement'),
        status: LmsStatuses.READY,
        priority: 'normal',
      })
    }
  }

  if (access.hasCoursesAccess && (!courseSummary || !courseSummary.signalAvailable)) {
    items.push({
      id: 'courses-unavailable',
      audience: 'teacher',
      title: t('builderItems.coursesUnavailable.title'),
      description: t('builderItems.coursesUnavailable.description'),
      href: '/dash/courses',
      primaryActionLabel: t('builderItems.coursesUnavailable.action'),
      source: 'course-management',
      sourceLabel: t('sourceLabels.courseManagement'),
      status: LmsStatuses.UNAVAILABLE,
      priority: 'normal',
    })
  }

  if (access.hasAnalyticsAccess && teacherSignal?.signalAvailable) {
    if (teacherSignal.slaBreaches > 0) {
      items.push({
        id: 'grading-sla-breaches',
        audience: 'teacher',
        title: t('builderItems.gradingSlaBreaches.title'),
        description: formatFeedbackLatencyDescription(teacherSignal.medianFeedbackLatencyHours, t),
        href: '/dash/analytics/assessments',
        primaryActionLabel: t('builderItems.gradingSlaBreaches.action'),
        source: 'teacher-analytics',
        sourceLabel: t('sourceLabels.teacherAnalytics'),
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'critical',
        metric: t('metrics.breaches', { count: teacherSignal.slaBreaches }),
      })
    }

    if (teacherSignal.gradingBacklogTotal > 0) {
      items.push({
        id: 'grading-backlog',
        audience: 'teacher',
        title: t('builderItems.gradingBacklog.title'),
        description: t('builderItems.gradingBacklog.description'),
        href: '/dash/analytics/assessments',
        primaryActionLabel: t('builderItems.gradingBacklog.action'),
        source: 'teacher-analytics',
        sourceLabel: t('sourceLabels.teacherAnalytics'),
        status: teacherSignal.slaBreaches > 0 ? LmsStatuses.NEEDS_ATTENTION : LmsStatuses.READY,
        priority: teacherSignal.slaBreaches > 0 ? 'critical' : 'high',
        metric: t('metrics.submissions', { count: teacherSignal.gradingBacklogTotal }),
      })
    }

    teacherSignal.backlogItems.slice(0, 3).forEach(item => {
      items.push({
        id: `manual-assessment-${item.assessmentId}`,
        audience: 'teacher',
        title: item.title,
        description: t('builderItems.manualAssessment.description', { course: item.courseName }),
        href: `/dash/analytics/assessments/manual_assessment/${item.assessmentId}`,
        primaryActionLabel: t('builderItems.manualAssessment.action'),
        source: 'teacher-analytics',
        sourceLabel: t('sourceLabels.crossCourseQueue'),
        status: item.slaBreaches > 0 ? LmsStatuses.NEEDS_ATTENTION : LmsStatuses.READY,
        priority: item.slaBreaches > 0 ? 'critical' : 'high',
        metric: t('metrics.awaitingReview', { count: item.awaitingReview }),
      })
    })

    if (teacherSignal.forecastBacklog7d > teacherSignal.gradingBacklogTotal) {
      items.push({
        id: 'forecast-grading-load',
        audience: 'teacher',
        title: t('builderItems.forecastGradingLoad.title'),
        description: t('builderItems.forecastGradingLoad.description'),
        href: '/dash/analytics/assessments',
        primaryActionLabel: t('builderItems.forecastGradingLoad.action'),
        source: 'teacher-analytics',
        sourceLabel: t('sourceLabels.teacherAnalytics'),
        status: LmsStatuses.IN_PROGRESS,
        priority: 'normal',
        metric: t('metrics.forecast', { count: teacherSignal.forecastBacklog7d }),
      })
    }

    if (teacherSignal.atRiskTotal > 0) {
      items.push({
        id: 'learner-risk',
        audience: 'teacher',
        title: t('builderItems.learnerRisk.title'),
        description: t('builderItems.learnerRisk.description'),
        href: '/dash/analytics/learners/at-risk',
        primaryActionLabel: t('builderItems.learnerRisk.action'),
        source: 'teacher-analytics',
        sourceLabel: t('sourceLabels.teacherAnalytics'),
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'high',
        metric: t('metrics.learners', { count: teacherSignal.atRiskTotal }),
      })
    }
  }

  if (access.hasAnalyticsAccess && teacherSignal && !teacherSignal.signalAvailable) {
    items.push({
      id: 'teacher-analytics-unavailable',
      audience: 'teacher',
      title: t('builderItems.teacherAnalyticsUnavailable.title'),
      description: t('builderItems.teacherAnalyticsUnavailable.description'),
      href: '/dash/analytics',
      primaryActionLabel: t('builderItems.teacherAnalyticsUnavailable.action'),
      source: 'teacher-analytics',
      sourceLabel: t('sourceLabels.teacherAnalytics'),
      status: LmsStatuses.UNAVAILABLE,
      priority: 'normal',
    })
  }

  return {
    audience: 'teacher',
    title: t('sections.teacher.title'),
    description: t('sections.teacher.description'),
    emptyTitle: t('sections.teacher.emptyTitle'),
    emptyDescription: t('sections.teacher.emptyDescription'),
    items: sortWorkQueueItems(items),
  }
}

function formatFeedbackLatencyDescription(hours: number | null, t: WorkQueueTranslate): string {
  if (hours === null) return t('builderItems.gradingSlaBreaches.latencyMissing')
  if (hours < 24) return t('builderItems.gradingSlaBreaches.latencyHours', { hours: Math.round(hours) })
  return t('builderItems.gradingSlaBreaches.latencyDays', { days: Math.round(hours / 24) })
}

interface AdminSectionInput {
  access: DashboardAccess
  adminSignal: AdminDashboardSignal | null
  t: WorkQueueTranslate
}

function buildAdminSection({ access, adminSignal, t }: AdminSectionInput): WorkQueueSection {
  const items: WorkQueueItem[] = []

  if (access.hasAdminAccess && adminSignal?.signalAvailable) {
    const aiBudgetUsage = getAiBudgetUsage(adminSignal)
    if (aiBudgetUsage !== null && aiBudgetUsage >= 90) {
      items.push({
        id: 'admin-ai-budget-critical',
        audience: 'admin',
        title: t('builderItems.adminAiBudgetCritical.title'),
        description: t('builderItems.adminAiBudgetCritical.description', { percent: aiBudgetUsage }),
        href: '/dash/admin',
        primaryActionLabel: t('builderItems.adminAiBudgetCritical.action'),
        source: 'ai-admin',
        sourceLabel: t('sourceLabels.aiOperations'),
        status: LmsStatuses.NEEDS_ATTENTION,
        priority: 'critical',
        metric: t('metrics.percentUsed', { count: aiBudgetUsage }),
      })
    } else if (aiBudgetUsage !== null && aiBudgetUsage >= 75) {
      items.push({
        id: 'admin-ai-budget-warning',
        audience: 'admin',
        title: t('builderItems.adminAiBudgetWarning.title'),
        description: t('builderItems.adminAiBudgetWarning.description', { percent: aiBudgetUsage }),
        href: '/dash/admin',
        primaryActionLabel: t('builderItems.adminAiBudgetWarning.action'),
        source: 'ai-admin',
        sourceLabel: t('sourceLabels.aiOperations'),
        status: LmsStatuses.IN_PROGRESS,
        priority: 'high',
        metric: t('metrics.percentUsed', { count: aiBudgetUsage }),
      })
    }
  }

  if (access.hasAdminAccess && adminSignal?.signalAvailable && adminSignal.teacherSlaBreaches > 0) {
    items.push({
      id: 'admin-workload-hotspots',
      audience: 'admin',
      title: t('builderItems.adminWorkloadHotspots.title'),
      description: t('builderItems.adminWorkloadHotspots.description'),
      href: '/dash/analytics/admin',
      primaryActionLabel: t('builderItems.adminWorkloadHotspots.action'),
      source: 'admin-analytics',
      sourceLabel: t('sourceLabels.adminAnalytics'),
      status: LmsStatuses.NEEDS_ATTENTION,
      priority: 'critical',
      metric: t('metrics.breaches', { count: adminSignal.teacherSlaBreaches }),
    })
  }

  if (access.hasAdminAccess && adminSignal?.signalAvailable && adminSignal.teacherBacklogTotal > 0) {
    items.push({
      id: 'admin-teacher-backlog',
      audience: 'admin',
      title: t('builderItems.adminTeacherBacklog.title'),
      description: t('builderItems.adminTeacherBacklog.description'),
      href: '/dash/analytics/admin',
      primaryActionLabel: t('builderItems.adminTeacherBacklog.action'),
      source: 'admin-analytics',
      sourceLabel: t('sourceLabels.adminAnalytics'),
      status: LmsStatuses.READY,
      priority: 'high',
      metric: t('metrics.submissions', { count: adminSignal.teacherBacklogTotal }),
    })
  }

  // `/dash/users/settings/users` is the admin directory (`GET /users`, `platform:read:platform`).
  if (access.hasAdminAccess) {
    items.push({
      id: 'user-access-audit',
      audience: 'admin',
      title: t('builderItems.userAccessAudit.title'),
      description: t('builderItems.userAccessAudit.description'),
      href: '/dash/users/settings/users',
      primaryActionLabel: t('builderItems.userAccessAudit.action'),
      source: 'access-control',
      sourceLabel: t('sourceLabels.accessControl'),
      status: LmsStatuses.READY,
      priority: 'normal',
    })
  }

  if (access.hasAdminAccess) {
    items.push({
      id: 'role-policy-review',
      audience: 'admin',
      title: t('builderItems.rolePolicyReview.title'),
      description: t('builderItems.rolePolicyReview.description'),
      href: '/dash/admin/roles',
      primaryActionLabel: t('builderItems.rolePolicyReview.action'),
      source: 'access-control',
      sourceLabel: t('sourceLabels.accessControl'),
      status: LmsStatuses.READY,
      priority: 'normal',
    })
  }

  if (access.hasAdminAccess && adminSignal && !adminSignal.signalAvailable) {
    items.push({
      id: 'admin-analytics-unavailable',
      audience: 'admin',
      title: t('builderItems.adminAnalyticsUnavailable.title'),
      description: t('builderItems.adminAnalyticsUnavailable.description'),
      href: '/dash/analytics/admin',
      primaryActionLabel: t('builderItems.adminAnalyticsUnavailable.action'),
      source: 'admin-analytics',
      sourceLabel: t('sourceLabels.adminAnalytics'),
      status: LmsStatuses.UNAVAILABLE,
      priority: 'normal',
    })
  }

  return {
    audience: 'admin',
    title: t('sections.admin.title'),
    description: t('sections.admin.description'),
    emptyTitle: t('sections.admin.emptyTitle'),
    emptyDescription: t('sections.admin.emptyDescription'),
    items: sortWorkQueueItems(items),
  }
}

function getAiBudgetUsage(adminSignal: AdminDashboardSignal): number | null {
  if (adminSignal.aiMonthlyBudget === null || adminSignal.aiRemainingBudget === null) return null
  if (adminSignal.aiMonthlyBudget <= 0) return null
  const used = adminSignal.aiMonthlyBudget - adminSignal.aiRemainingBudget
  return Math.max(0, Math.min(100, Math.round((used / adminSignal.aiMonthlyBudget) * 100)))
}

function buildDashboardTools(access: DashboardAccess, t: WorkQueueTranslate): DashboardToolItem[] {
  const tools: DashboardToolItem[] = [
    {
      id: 'browse-courses',
      title: t('tools.browseCourses.title'),
      description: t('tools.browseCourses.description'),
      href: '/courses',
      audience: 'learner',
    },
    {
      id: 'courses',
      title: t('tools.courses.title'),
      description: t('tools.courses.description'),
      href: '/dash/courses',
      audience: 'teacher',
    },
    {
      id: 'analytics',
      title: t('tools.analytics.title'),
      description: t('tools.analytics.description'),
      href: '/dash/analytics',
      audience: 'teacher',
    },
    {
      id: 'users',
      title: t('tools.users.title'),
      description: t('tools.users.description'),
      // The settings index lands on the first tab the caller may open.
      href: '/dash/users/settings',
      audience: 'admin',
    },
    {
      id: 'admin',
      title: t('tools.admin.title'),
      description: t('tools.admin.description'),
      href: '/dash/admin',
      audience: 'admin',
      badge: t('tools.admin.badge'),
    },
    {
      id: 'account',
      title: t('tools.account.title'),
      description: t('tools.account.description'),
      href: '/dash/user-account/settings/general',
      audience: 'all',
    },
  ]

  return tools.filter(tool => {
    if (tool.audience === 'all' || tool.audience === 'learner') return true
    if (tool.id === 'courses') return access.hasCoursesAccess
    if (tool.id === 'analytics') return access.hasAnalyticsAccess
    // The users card is the only admin-audience tool an instructor may open
    // (usergroups); `/dash/admin` needs the platform/role grants.
    if (tool.id === 'users') return access.hasUsersAccess || access.hasAdminAccess
    return access.hasAdminAccess
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
