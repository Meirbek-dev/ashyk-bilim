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
})
