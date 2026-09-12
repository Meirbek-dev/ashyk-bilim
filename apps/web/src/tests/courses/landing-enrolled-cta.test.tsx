/** @vitest-environment jsdom */
// Critic 9 (leave-course gap): a learner who left a course but keeps
// submissions is `enrolled:true, can_enroll:false` on the wire, yet the landing
// read only the trail run and offered «Начать курс». The wire decides the CTA;
// «Продолжить» re-creates the missing trail run so `/trail` lists the course.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import CoursesActions from '@/components/Objects/Courses/CourseActions/CoursesActions'
import type { LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({ startCourse: vi.fn(), push: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'u1', username: 'learner' } }) }))
vi.mock('@/hooks/useContributorStatus', () => ({
  useContributorStatus: () => ({ contributorStatus: null, contributorRole: null, refetch: vi.fn() }),
}))
vi.mock('@/features/courses/hooks/useContributors', () => ({ useContributorMutations: () => ({ apply: vi.fn() }) }))
vi.mock('@services/courses/activity', () => ({ startCourse: (...args: unknown[]) => mocks.startCourse(...args) }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (path: string) => path }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Objects/Courses/CourseProgress/CourseProgress', () => ({ default: () => null }))

const course = {
  course_uuid: 'course_c1',
  name: 'Курс',
  chapters: [{ activities: [{ activity_uuid: 'activity_a1' }] }],
} as unknown as AppCourse

const enrolledWithoutRun = {
  enrolled: true,
  enrollment_state: 'in_progress',
  permissions: { can_enroll: false },
  outline: [{ id: 'ch', activities: [{ id: 'a1', complete: false }] }],
} as unknown as LearnerCourseState

function renderActions(learnerState: LearnerCourseState | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <CoursesActions courseuuid="c1" course={course} trailData={{ runs: [] } as never} learnerState={learnerState} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.startCourse.mockReset().mockResolvedValue({ runs: [] })
  mocks.push.mockReset()
})

describe('course landing CTA vs learner-state', () => {
  it('offers «Продолжить» when the wire says enrolled, even without a trail run', async () => {
    renderActions(enrolledWithoutRun)
    expect(screen.queryByRole('button', { name: /Начать курс/ })).toBeNull()
    const continueButton = screen.getByRole('button', { name: /Продолжить/ })
    fireEvent.click(continueButton)
    // The run is restored silently, then the learner lands on the first unfinished activity.
    await waitFor(() => expect(mocks.startCourse).toHaveBeenCalledWith('course_c1'))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/course/c1/activity/a1')))
  })

  it('still offers «Начать курс» when the wire says not enrolled', () => {
    renderActions({ ...enrolledWithoutRun, enrolled: false } as LearnerCourseState)
    expect(screen.getByRole('button', { name: /Начать курс/ })).toBeInTheDocument()
  })
})
