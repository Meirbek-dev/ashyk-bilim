import { getTranslations } from 'next-intl/server'

import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'
import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeeUsers } from '@/lib/rbac/navigation-policy'
import { getEditableCourses } from '@services/courses/courses'
import { getAdminAnalyticsOverview, getTeacherOverview } from '@services/analytics/teacher'
import { buildDashboardWorkQueue, DashboardWorkQueue } from '@/features/work-queue'

import type { Action, Resource, Scope } from '@/types/permissions'
import type { AdminAnalyticsResponse, TeacherOverviewResponse } from '@/types/analytics'

interface DashboardAccess {
  hasCoursesAccess: boolean
  hasAnalyticsAccess: boolean
  hasUsersAccess: boolean
  hasAdminAccess: boolean
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

  const [courseSummary, teacherOverview, adminOverview] = await Promise.all([
    access.hasCoursesAccess ? getSafeEditableCourseSummary() : Promise.resolve(null),
    access.hasAnalyticsAccess ? getSafeTeacherOverview() : Promise.resolve(null),
    access.hasAdminAccess ? getSafeAdminOverview() : Promise.resolve(null),
  ])

  const queue = buildDashboardWorkQueue({
    access,
    courseSummary,
    teacherSignal: teacherOverview
      ? {
          atRiskTotal: teacherOverview.at_risk_total,
          gradingBacklogTotal: teacherOverview.workload.backlog_total,
          slaBreaches: teacherOverview.workload.sla_breaches,
          signalAvailable: true,
        }
      : access.hasAnalyticsAccess
        ? {
            atRiskTotal: 0,
            gradingBacklogTotal: 0,
            slaBreaches: 0,
            signalAvailable: false,
          }
        : null,
    adminSignal: adminOverview
      ? {
          teacherBacklogTotal: adminOverview.teacher_workload_comparison.reduce(
            (total, row) => total + row.workload_backlog,
            0,
          ),
          teacherSlaBreaches: adminOverview.teacher_workload_comparison.reduce(
            (total, row) => total + row.sla_breaches,
            0,
          ),
          signalAvailable: true,
        }
      : access.hasAdminAccess
        ? {
            teacherBacklogTotal: 0,
            teacherSlaBreaches: 0,
            signalAvailable: false,
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

async function getSafeEditableCourseSummary() {
  try {
    const { summary } = await getEditableCourses(1, 1, '', 'updated', 'attention')
    return summary
  } catch (error) {
    console.warn('[dashboard] Failed to load editable course summary:', error)
    return null
  }
}

async function getSafeTeacherOverview(): Promise<TeacherOverviewResponse | null> {
  try {
    return await getTeacherOverview(analyticsQueueQuery)
  } catch (error) {
    console.warn('[dashboard] Failed to load teacher overview:', error)
    return null
  }
}

async function getSafeAdminOverview(): Promise<AdminAnalyticsResponse | null> {
  try {
    return await getAdminAnalyticsOverview(analyticsQueueQuery)
  } catch (error) {
    console.warn('[dashboard] Failed to load admin overview:', error)
    return null
  }
}
