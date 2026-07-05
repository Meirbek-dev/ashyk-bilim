import { getTranslations } from 'next-intl/server'

import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'
import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeeUsers } from '@/lib/rbac/navigation-policy'
import { getEditableCourses } from '@services/courses/courses'
import { getAdminAnalyticsOverview, getTeacherOverview } from '@services/analytics/teacher'
import { buildDashboardWorkQueue, DashboardWorkQueue } from '@/features/work-queue'
import { apiFetcher } from '@/lib/api-client'

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

const analyticsQueueQuery = {
  window: '28d',
  compare: 'previous_period',
  bucket: 'day',
  page: 1,
  page_size: 3,
  sort_order: 'desc',
  timezone: 'UTC',
} as const

const dashboardQueueCopy = {
  priorityLabel: 'Priority Queue',
  title: 'Start With Work That Needs a Person',
  description: 'The dashboard now starts with role-specific work, then keeps sections and tools below for browsing.',
  browseLabel: 'Browse',
  toolsTitle: 'Tools & Sections',
  toolsDescription: 'Use these when you need to explore, configure, or jump to a workspace.',
  openLabel: 'Open',
}

export default async function PlatformDashHomePage() {
  const [tGeneral, session] = await Promise.all([getTranslations('General'), requireSession()])
  const permsSet = new Set<string>(session.permissions)

  const can = (resource: Resource, action: Action, scope: Scope): boolean =>
    sessionCan(session, resource, action, scope, permsSet)

  const access = {
    hasCoursesAccess: canSeeCourses(can),
    hasAnalyticsAccess: canSeeAnalytics(can),
    hasUsersAccess: canSeeUsers(can),
    hasAdminAccess: canSeeAdmin(can),
  } satisfies DashboardAccess

  const [courseSummaryResult, teacherOverviewResult, adminOverviewResult, aiUsageResult] = await Promise.all([
    access.hasCoursesAccess ? getSafeEditableCourseSummary() : Promise.resolve({ data: null, error: null }),
    access.hasAnalyticsAccess ? getSafeTeacherOverview() : Promise.resolve({ data: null, error: null }),
    access.hasAdminAccess ? getSafeAdminOverview() : Promise.resolve({ data: null, error: null }),
    access.hasAdminAccess ? getSafeAIUsageSummary() : Promise.resolve({ data: null, error: null }),
  ])

  const courseSummary = courseSummaryResult.data
  const teacherOverview = teacherOverviewResult.data
  const adminOverview = adminOverviewResult.data
  const aiUsage = aiUsageResult.data

  const queue = buildDashboardWorkQueue({
    access,
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
        <DashboardWorkQueue sections={queue.sections} tools={queue.tools} copy={dashboardQueueCopy} />
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
    const data = await apiFetcher<AIUsageSummary>('ai/usage')
    return { data, error: null }
  } catch (error) {
    console.warn('[dashboard] Failed to load AI usage summary:', error)
    return { data: null, error: error instanceof Error ? error.message : String(error) }
  }
}
