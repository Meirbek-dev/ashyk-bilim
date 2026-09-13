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
import { APIError } from '@/lib/api/assertSuccess'
import type { LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({
  startCourse: vi.fn(),
  push: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  user: { id: 'u1', username: 'learner' } as { id: string; username: string } | null,
  contributorStatus: null as string | null,
}))

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: mocks.user }) }))
vi.mock('@/hooks/useContributorStatus', () => ({
  useContributorStatus: () => ({
    contributorStatus: mocks.contributorStatus,
    contributorRole: null,
    refetch: mocks.refetch,
  }),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/features/courses/hooks/useContributors', () => ({
  useContributorMutations: () => ({ apply: vi.fn(), remove: mocks.remove }),
}))
vi.mock('@services/courses/activity', () => ({ startCourse: (...args: unknown[]) => mocks.startCourse(...args) }))
vi.mock('@services/config/config', () => ({ getAbsoluteUrl: (path: string) => path }))
vi.mock('@components/Objects/UserAvatar', () => ({ default: () => null }))
vi.mock('@/components/Objects/Courses/CourseProgress/CourseProgress', () => ({ default: () => null }))

const course = {
  course_uuid: 'course_c1',
  name: 'Курс',
  open_to_contributors: true,
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
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.refetch.mockReset().mockResolvedValue(undefined)
  mocks.toast.info.mockReset()
  mocks.user = { id: 'u1', username: 'learner' }
  mocks.contributorStatus = null
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

  // UX-021: anonymous → login with a returnTo back to this course.
  it('sends an anonymous «Начать курс» to login with returnTo', () => {
    mocks.user = null
    renderActions(null)
    fireEvent.click(screen.getByRole('button', { name: /Начать курс/ }))
    expect(mocks.push).toHaveBeenCalledWith('/login?returnTo=%2Fcourse%2Fc1')
  })

  // UX-023: a pending applicant may withdraw (`DELETE contributors/{self}`).
  it('lets a pending applicant withdraw the application', async () => {
    mocks.contributorStatus = 'PENDING'
    renderActions(enrolledWithoutRun)
    expect(screen.getByText(/на рассмотрении/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Отозвать заявку/ }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('u1'))
  })

  // UX-050: the teacher approved meanwhile — a stale «Отозвать» must refetch and explain, not toast «нет прав».
  it('refetches and explains when a stale withdraw hits 403', async () => {
    mocks.contributorStatus = 'PENDING'
    mocks.remove.mockRejectedValueOnce(new APIError({ status: 403, code: 'forbidden', message: 'forbidden' }))
    renderActions(enrolledWithoutRun)
    fireEvent.click(screen.getByRole('button', { name: /Отозвать заявку/ }))
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled())
    expect(mocks.toast.info).toHaveBeenCalledWith(
      ruMessages.Courses.CoursesActions.applicationAlreadyReviewed,
      expect.anything(),
    )
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  // UX-053: 100 % without a certificate is `review_completion` on the wire, not «Продолжить обучение».
  it('labels a completed course without a certificate as a review, not «Продолжить»', () => {
    renderActions({
      ...enrolledWithoutRun,
      enrollment_state: 'completed',
      outline: [{ id: 'ch', activities: [{ id: 'a1', complete: true }] }],
      next_action: { id: 'review_completion', enabled: true, label: '', reason: 'course_complete' },
    } as unknown as LearnerCourseState)
    expect(screen.queryByRole('button', { name: /Продолжить обучение/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Посмотреть итоги курса/ })).toBeInTheDocument()
  })
})
