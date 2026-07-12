import { getTranslations } from 'next-intl/server'

import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'
import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeeUsers } from '@/lib/rbac/navigation-policy'
import { getEditableCourses } from '@services/courses/courses'
import { getAdminAnalyticsOverview, getTeacherOverview } from '@services/analytics/teacher'
import { buildDashboardWorkQueue, DashboardWorkQueue } from '@/features/work-queue'
import { apiJson } from '@/lib/api-client'

import type { Action, Resource, Scope } from '@/types/permissions'
import type { AdminAnalyticsResponse, TeacherOverviewResponse } from '@/types/analytics'

interface DashboardAccess {
  hasCoursesAccess: boolean
  hasAnalyticsAccess: boolean
  hasUsersAccess: boolean
  hasAdminAccess: boolean
}

interface AIUsageSummary {
  monthly_budget: number
  remaining_budget: number
}

interface WorkQueueApiResponse {
  items: {
    id: string
    role: 'learner' | 'teacher'
    kind: string
    status: string
    priority: 'critical' | 'high' | 'normal' | 'low'
    title: string
    description: string
    href: string
    primary_action: string
    course_title?: string | null
    activity_title?: string | null
    due_at?: string | null
    created_at?: string | null
  }[]
  total: number
  next_cursor?: string | null
}

const analyticsQueueQuery = {
  window: '28d',
  compare: 'previous_period',
  bucket: 'day',
  page: 1,
  page_size: 3,
  sort_order: 'desc',
  timezone: 'UTC',
} as const

export default async function PlatformDashHomePage() {
  const [tGeneral, tQueue, session] = await Promise.all([
    getTranslations('General'),
    getTranslations('DashboardWorkQueue'),
    requireSession(),
  ])
  const permsSet = new Set<string>(session.permissions)

  const can = (resource: Resource, action: Action, scope: Scope): boolean =>
    sessionCan(session, resource, action, scope, permsSet)

  const access = {
    hasCoursesAccess: canSeeCourses(can),
    hasAnalyticsAccess: canSeeAnalytics(can),
    hasUsersAccess: canSeeUsers(can),
    hasAdminAccess: canSeeAdmin(can),
  } satisfies DashboardAccess

  const [
    courseSummaryResult,
    teacherOverviewResult,
    adminOverviewResult,
    aiUsageResult,
    learnerWorkResult,
    teacherWorkResult,
  ] = await Promise.all([
    access.hasCoursesAccess ? getSafeEditableCourseSummary() : Promise.resolve({ data: null, error: null }),
    access.hasAnalyticsAccess ? getSafeTeacherOverview() : Promise.resolve({ data: null, error: null }),
    access.hasAdminAccess ? getSafeAdminOverview() : Promise.resolve({ data: null, error: null }),
    access.hasAdminAccess ? getSafeAIUsageSummary() : Promise.resolve({ data: null, error: null }),
    getSafeLearnerWork(),
    access.hasCoursesAccess || access.hasAnalyticsAccess
      ? getSafeTeacherWork()
      : Promise.resolve({ data: null, error: null }),
  ])

  const courseSummary = courseSummaryResult.data
  const teacherOverview = teacherOverviewResult.data
  const adminOverview = adminOverviewResult.data
  const aiUsage = aiUsageResult.data
  const learnerWork = learnerWorkResult.data
  const teacherWork = teacherWorkResult.data
  const localizeWorkItem = (item: WorkQueueApiResponse['items'][number]) => {
    const activity = item.activity_title || item.title
    const course = item.course_title || tQueue('items.unknownCourse')
    switch (item.kind) {
      case 'returned_for_revision': {
        return {
          ...item,
          title: tQueue('items.returned.title', { activity }),
          description: tQueue('items.returned.description', { course }),
          primary_action: tQueue('items.returned.action'),
          groupLabel: tQueue('groups.returned'),
        }
      }
      case 'waiting_for_grade': {
        return {
          ...item,
          title: tQueue('items.waiting.title', { activity }),
          description: tQueue('items.waiting.description', { course }),
          primary_action: tQueue('items.waiting.action'),
          groupLabel: tQueue('groups.waiting'),
        }
      }
      case 'feedback_released': {
        return {
          ...item,
          title: tQueue('items.feedback.title', { activity }),
          description: tQueue('items.feedback.description', { course }),
          primary_action: tQueue('items.feedback.action'),
          groupLabel: tQueue('groups.released'),
        }
      }
      case 'overdue':
      case 'in_progress': {
        return {
          ...item,
          title: tQueue(item.kind === 'overdue' ? 'items.overdue.title' : 'items.inProgress.title', { activity }),
          description: tQueue(item.kind === 'overdue' ? 'items.overdue.description' : 'items.inProgress.description', {
            course,
          }),
          primary_action: tQueue('items.inProgress.action'),
          groupLabel: tQueue(item.kind === 'overdue' ? 'groups.today' : 'groups.dueSoon'),
        }
      }
      case 'awaiting_release': {
        return {
          ...item,
          title: tQueue('items.awaitingRelease.title', { activity }),
          description: tQueue('items.awaitingRelease.description', { course }),
          primary_action: tQueue('items.awaitingRelease.action'),
        }
      }
      case 'needs_grading':
      case 'sla_breach': {
        return {
          ...item,
          title: tQueue(item.kind === 'sla_breach' ? 'items.slaBreach.title' : 'items.needsGrading.title', {
            activity,
          }),
          description: tQueue(
            item.kind === 'sla_breach' ? 'items.slaBreach.description' : 'items.needsGrading.description',
            { course },
          ),
          primary_action: tQueue('items.needsGrading.action'),
        }
      }
      default: {
        return item
      }
    }
  }

  const queue = buildDashboardWorkQueue({
    access,
    learnerSignal: learnerWork
      ? { items: learnerWork.items.map(localizeWorkItem), signalAvailable: true }
      : { items: [], signalAvailable: false },
    courseSummary: courseSummary
      ? {
          ...courseSummary,
          signalAvailable: true,
          errorMessage: null,
        }
      : access.hasCoursesAccess
        ? {
            total: 0,
            ready: 0,
            private: 0,
            attention: 0,
            signalAvailable: false,
            errorMessage: courseSummaryResult.error,
          }
        : null,
    teacherSignal: teacherOverview
      ? {
          atRiskTotal: teacherOverview.at_risk_total ?? 0,
          gradingBacklogTotal: teacherOverview.workload.backlog_total ?? 0,
          slaBreaches: teacherOverview.workload.sla_breaches ?? 0,
          forecastBacklog7d: teacherOverview.workload.forecast_backlog_7d ?? 0,
          medianFeedbackLatencyHours: teacherOverview.workload.median_feedback_latency_hours ?? null,
          backlogItems: teacherOverview.workload.backlog_by_manual_assessment.map(item => ({
            assessmentId: item.assessment_id,
            awaitingReview: item.awaiting_review,
            courseName: item.course_name,
            title: item.title,
            slaBreaches: item.sla_breaches ?? 0,
          })),
          signalAvailable: true,
          errorMessage: null,
          workItems: teacherWork?.items.map(localizeWorkItem) ?? [],
        }
      : access.hasAnalyticsAccess
        ? {
            atRiskTotal: 0,
            gradingBacklogTotal: 0,
            slaBreaches: 0,
            forecastBacklog7d: 0,
            medianFeedbackLatencyHours: null,
            backlogItems: [],
            signalAvailable: false,
            errorMessage: teacherOverviewResult.error,
            workItems: teacherWork?.items.map(localizeWorkItem) ?? [],
          }
        : null,
    adminSignal: adminOverview
      ? {
          aiMonthlyBudget: aiUsage?.monthly_budget ?? null,
          aiRemainingBudget: aiUsage?.remaining_budget ?? null,
          teacherBacklogTotal: adminOverview.teacher_workload_comparison.reduce(
            (total, row) => total + row.workload_backlog,
            0,
          ),
          teacherSlaBreaches: adminOverview.teacher_workload_comparison.reduce(
            (total, row) => total + row.sla_breaches,
            0,
          ),
          signalAvailable: true,
          errorMessage: adminOverviewResult.error || aiUsageResult.error,
        }
      : access.hasAdminAccess
        ? {
            aiMonthlyBudget: aiUsage?.monthly_budget ?? null,
            aiRemainingBudget: aiUsage?.remaining_budget ?? null,
            teacherBacklogTotal: 0,
            teacherSlaBreaches: 0,
            signalAvailable: Boolean(aiUsage),
            errorMessage: adminOverviewResult.error || aiUsageResult.error,
          }
        : null,
  })

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      <DashHeader title={tGeneral('dashboard')} description={tGeneral('dashboardWelcome')} />

      <main className="container mx-auto flex-1 px-4 py-8 md:py-10 lg:px-8">
        <DashboardWorkQueue
          sections={queue.sections}
          tools={queue.tools}
          copy={{
            priorityLabel: tQueue('priorityLabel'),
            title: tQueue('title'),
            description: tQueue('description'),
            browseLabel: tQueue('browseLabel'),
            toolsTitle: tQueue('toolsTitle'),
            toolsDescription: tQueue('toolsDescription'),
            openLabel: tQueue('openLabel'),
          }}
        />
      </main>
    </div>
  )
}

async function getSafeEditableCourseSummary(): Promise<{
  data: Awaited<ReturnType<typeof getEditableCourses>>['summary'] | null
  error: string | null
}> {
  try {
    const { summary } = await getEditableCourses(1, 1, '', 'updated', 'attention')
    return { data: summary, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load editable course summary:', error)
    return { data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function getSafeTeacherOverview(): Promise<{ data: TeacherOverviewResponse | null; error: string | null }> {
  try {
    const data = await getTeacherOverview(analyticsQueueQuery)
    return { data, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load teacher overview:', error)
    return { data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function getSafeAdminOverview(): Promise<{ data: AdminAnalyticsResponse | null; error: string | null }> {
  try {
    const data = await getAdminAnalyticsOverview(analyticsQueueQuery)
    return { data, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load admin overview:', error)
    return { data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function getSafeAIUsageSummary(): Promise<{ data: AIUsageSummary | null; error: string | null }> {
  try {
    const data = await apiJson<AIUsageSummary>('ai/usage')
    return { data, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load AI usage summary:', error)
    return { data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function getSafeLearnerWork(): Promise<{ data: WorkQueueApiResponse | null; error: string | null }> {
  try {
    const data = await apiJson<WorkQueueApiResponse>('me/work?role=learner&limit=50')
    return { data, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load learner work:', error)
    return { data: null, error: 'learner_work_unavailable' }
  }
}

async function getSafeTeacherWork(): Promise<{ data: WorkQueueApiResponse | null; error: string | null }> {
  try {
    const data = await apiJson<WorkQueueApiResponse>('me/work?role=teacher&limit=50')
    return { data, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load teacher work:', error)
    return { data: null, error: 'teacher_work_unavailable' }
  }
}
