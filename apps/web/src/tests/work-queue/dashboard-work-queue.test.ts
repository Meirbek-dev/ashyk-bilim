import { describe, expect, it } from 'vitest'

import { buildDashboardWorkQueue } from '@/features/work-queue'

const t = (key: string) => `t:${key}`

describe('buildDashboardWorkQueue', () => {
  it('renders the learner section title and empty state through the translator, not the English literal', () => {
    const access = {
      hasCoursesAccess: false,
      hasAnalyticsAccess: false,
      hasUsersAccess: false,
      hasAdminAccess: false,
    }

    const queue = buildDashboardWorkQueue({
      access,
      courseSummary: null,
      teacherSignal: null,
      adminSignal: null,
      learnerSignal: { items: [], signalAvailable: false },
      t,
    })

    expect(queue.sections).toHaveLength(1)
    const [learnerSection] = queue.sections

    expect(learnerSection?.title).toBe('t:sections.learner.title')
    expect(learnerSection?.emptyTitle).toBe('t:sections.learner.emptyTitle')
    expect(learnerSection?.description).toBe('t:sections.learner.description')
    expect(learnerSection?.emptyDescription).toBe('t:sections.learner.emptyDescription')

    expect(learnerSection?.title).not.toBe('Learner Work')
    expect(learnerSection?.description).not.toBe('Assignments and course actions that need the learner next.')
    expect(learnerSection?.emptyTitle).not.toBe('No learner work is queued')
  })

  it('gives instructor-like grants (users access via usergroup:read) only the teacher section', () => {
    const queue = buildDashboardWorkQueue({
      access: { hasCoursesAccess: true, hasAnalyticsAccess: true, hasUsersAccess: true, hasAdminAccess: false },
      courseSummary: null,
      teacherSignal: null,
      adminSignal: null,
      learnerSignal: null,
      t,
    })

    expect(queue.sections.map(section => section.audience)).toEqual(['teacher'])
  })

  // UX-093: the count badge is one ICU plural message («1 работа», not «1 работ»).
  it('passes the count into the metric message', () => {
    const queue = buildDashboardWorkQueue({
      access: { hasCoursesAccess: true, hasAnalyticsAccess: true, hasUsersAccess: true, hasAdminAccess: false },
      courseSummary: null,
      teacherSignal: {
        atRiskTotal: 0,
        gradingBacklogTotal: 1,
        slaBreaches: 0,
        forecastBacklog7d: 0,
        medianFeedbackLatencyHours: null,
        backlogItems: [],
        signalAvailable: true,
      },
      adminSignal: null,
      learnerSignal: null,
      t: (key, values) => `t:${key}:${values?.count ?? ''}`,
    })

    const backlog = queue.sections.flatMap(section => section.items).find(item => item.id === 'grading-backlog')
    expect(backlog?.metric).toBe('t:metrics.submissions:1')
  })

  it('gives admins the admin section with the user directory item', () => {
    const queue = buildDashboardWorkQueue({
      access: { hasCoursesAccess: true, hasAnalyticsAccess: true, hasUsersAccess: true, hasAdminAccess: true },
      courseSummary: null,
      teacherSignal: null,
      adminSignal: null,
      learnerSignal: null,
      t,
    })

    const admin = queue.sections.find(section => section.audience === 'admin')
    expect(admin?.items.map(item => item.id)).toContain('user-access-audit')
  })

  // Critic 9: a quiz draft with no due date was tagged «Скоро срок».
  it('tags an in-progress item «due soon» only when it has a due date', () => {
    const base = {
      kind: 'in_progress',
      status: 'draft',
      priority: 'normal' as const,
      title: 'Столицы',
      description: '',
      href: '/x',
      primary_action: 'go',
    }
    const queue = buildDashboardWorkQueue({
      access: { hasCoursesAccess: false, hasAnalyticsAccess: false, hasUsersAccess: false, hasAdminAccess: false },
      courseSummary: null,
      teacherSignal: null,
      adminSignal: null,
      learnerSignal: {
        signalAvailable: true,
        items: [
          { ...base, id: 'no-due', due_at: null },
          { ...base, id: 'due', due_at: '2026-09-13T00:00:00.000Z' },
          { ...base, id: 'overdue', kind: 'overdue', due_at: '2026-09-10T00:00:00.000Z' },
        ],
      },
      t,
    })
    const labels = Object.fromEntries(queue.sections[0]!.items.map(item => [item.id, item.groupLabel]))
    expect(labels).toEqual({ 'no-due': undefined, due: 't:groups.dueSoon', overdue: 't:groups.today' })
  })
})
