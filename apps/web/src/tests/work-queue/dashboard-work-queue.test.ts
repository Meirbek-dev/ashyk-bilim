import { describe, expect, it } from 'vitest'

import { buildDashboardWorkQueue } from '@/features/work-queue'

describe('buildDashboardWorkQueue localization', () => {
  it('renders the learner section title and empty state through the translator, not the English literal', () => {
    const access = {
      hasCoursesAccess: false,
      hasAnalyticsAccess: false,
      hasUsersAccess: false,
      hasAdminAccess: false,
    }

    const t = (key: string) => `t:${key}`

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
})
