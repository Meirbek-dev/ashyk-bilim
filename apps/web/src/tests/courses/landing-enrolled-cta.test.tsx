/** @vitest-environment jsdom */
// Critic 9 (leave-course gap): a learner who left a course but keeps
// submissions is `enrolled:true, can_enroll:false` on the wire, yet the landing
// read only the trail run and offered «Начать курс». The wire decides the CTA;
// «Продолжить» re-creates the missing trail run so `/trail` lists the course.
// UX-174..176: the phone card runs the same CTA/contributor code as the
// desktop sidebar — every case runs against both.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import CoursesActions from '@/components/Objects/Courses/CourseActions/CoursesActions'
import CourseActionsMobile from '@/components/Objects/Courses/CourseActions/CourseActionsMobile'
import { APIError } from '@/lib/api/assertSuccess'
import type { LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  apply: vi.fn(),
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
  useContributorMutations: () => ({ apply: mocks.apply, remove: mocks.remove }),
  useContributors: () => ({ data: [] }),
}))
vi.mock('@/lib/api-client', () => ({ apiJson: (...args: unknown[]) => mocks.apiJson(...args) }))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@services/media/media', () => ({ getUserAvatarMediaDirectory: () => '' }))
vi.mock('@/components/Objects/UserAvatar', () => ({ default: () => null }))
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

const COMPONENTS = [
  ['desktop', CoursesActions],
  ['phone', CourseActionsMobile],
] as const
let Actions: (typeof COMPONENTS)[number][1] = CoursesActions

function renderActions(learnerState: LearnerCourseState | null, client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <Actions courseuuid="c1" course={course} trailData={{ runs: [] } as never} learnerState={learnerState} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}
const START_URL = 'trail/courses/c1'
const completed = {
  ...enrolledWithoutRun,
  enrollment_state: 'completed',
  outline: [{ id: 'ch', activities: [{ id: 'a1', complete: true }] }],
  next_action: { id: 'review_completion', enabled: true, label: '', reason: 'course_complete' },
} as unknown as LearnerCourseState

beforeEach(() => {
  mocks.apiJson.mockReset().mockResolvedValue({ runs: [] })
  mocks.apply.mockReset().mockResolvedValue(undefined)
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  mocks.toast.loading.mockReturnValue('t1')
  mocks.push.mockReset()
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.refetch.mockReset().mockResolvedValue(undefined)
  mocks.user = { id: 'u1', username: 'learner' }
  mocks.contributorStatus = null
})

describe.each(COMPONENTS)('course landing CTA vs learner-state (%s)', (_, Component) => {
  beforeEach(() => {
    Actions = Component
  })

  it('offers «Продолжить» when the wire says enrolled, even without a trail run', async () => {
    renderActions(enrolledWithoutRun)
    expect(screen.queryByRole('button', { name: /Начать курс/ })).toBeNull()
    const continueButton = screen.getByRole('button', { name: /Продолжить/ })
    fireEvent.click(continueButton)
    // The run is restored silently, then the learner lands on the first unfinished activity.
    await waitFor(() => expect(mocks.apiJson).toHaveBeenCalledWith(START_URL, { method: 'POST' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/course/c1/activity/a1')))
  })

  it('still offers «Начать курс» when the wire says not enrolled', () => {
    renderActions({ ...enrolledWithoutRun, enrolled: false } as LearnerCourseState)
    expect(screen.getByRole('button', { name: /Начать курс/ })).toBeInTheDocument()
  })

  // BUG-287: the course's staff preview it — «Открыть курс», never an enrol call.
  it('offers staff «Открыть курс» without enrolling', async () => {
    renderActions({
      ...enrolledWithoutRun,
      enrolled: false,
      permissions: { can_enroll: false, denial_reason: 'staff_preview' },
    } as unknown as LearnerCourseState)
    expect(screen.queryByRole('button', { name: /Начать курс/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Открыть курс/ }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('/course/c1/activity/a1')))
    expect(mocks.apiJson).not.toHaveBeenCalled()
  })

  // UX-119: the landing reads learner-state (5 s staleTime) — enrolling must
  // invalidate it, or Back from the first activity offers «Начать курс» again.
  it('invalidates learner-state after «Начать курс»', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    renderActions({ ...enrolledWithoutRun, enrolled: false } as LearnerCourseState, client)
    fireEvent.click(screen.getByRole('button', { name: /Начать курс/ }))
    await waitFor(() => expect(mocks.apiJson).toHaveBeenCalledWith(START_URL, { method: 'POST' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['learner-course', 'c1', 'state'] }))
  })

  // UX-119: 0/0 (every activity unpublished) — no dead «Продолжить», an empty state instead.
  it('hides the CTA on a course with no published activities', () => {
    renderActions({ ...enrolledWithoutRun, outline: [] } as unknown as LearnerCourseState)
    expect(screen.queryByRole('button', { name: /Продолжить/ })).toBeNull()
    expect(screen.getByText(ruMessages.Courses.CoursesActions.noPublishedActivities)).toBeInTheDocument()
  })

  // UX-021: anonymous → login with a returnTo back to this course.
  it('sends an anonymous «Начать курс» to login with returnTo', () => {
    mocks.user = null
    renderActions(null)
    fireEvent.click(screen.getByRole('button', { name: /Начать курс|Войти/ }))
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

  // UX-053 / UX-174: 100 % without a certificate is `review_completion` on the wire, not «Продолжить обучение».
  it('labels a completed course without a certificate as a review, not «Продолжить»', () => {
    renderActions(completed)
    expect(screen.queryByRole('button', { name: /Продолжить обучение/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Посмотреть итоги курса/ })).toBeInTheDocument()
  })

  it('leads a completed course with a certificate to the certificate', () => {
    renderActions({
      ...completed,
      certificate: { issued: true, href: '/certificates/x' },
    } as unknown as LearnerCourseState)
    fireEvent.click(screen.getByRole('button', { name: /Просмотреть сертификат/ }))
    expect(mocks.push).toHaveBeenCalledWith('/certificates/x')
  })

  // UX-175: a start that fails (course went private → 404) says so; a start that works says so too.
  it('toasts a failed start through the API error presenter', async () => {
    mocks.apiJson.mockRejectedValueOnce(new APIError({ status: 404, code: 'not-found', message: 'not found' }))
    renderActions({ ...enrolledWithoutRun, enrolled: false } as LearnerCourseState)
    fireEvent.click(screen.getByRole('button', { name: /Начать курс/ }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.any(String), { id: 't1' }))
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('toasts a successful start', async () => {
    renderActions({ ...enrolledWithoutRun, enrolled: false } as LearnerCourseState)
    fireEvent.click(screen.getByRole('button', { name: /Начать курс/ }))
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(ruMessages.Courses.CoursesActions.startedCourseSuccess, {
        id: 't1',
      }),
    )
  })

  // UX-176: a course open to contributors offers the application on every landing.
  it('lets a learner apply to contribute', async () => {
    renderActions(enrolledWithoutRun)
    fireEvent.click(screen.getByRole('button', { name: ruMessages.Courses.CoursesActions.aria.applyToBecome }))
    await waitFor(() => expect(mocks.apply).toHaveBeenCalled())
  })
})
