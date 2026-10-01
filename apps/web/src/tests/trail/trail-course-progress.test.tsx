/** @vitest-environment jsdom */
// Gauntlet: the trail card showed "0/4 шага 0%" from trail `steps` (lesson-type
// only, UX not progress) while the course page showed 2/4 from learner-state.
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TrailCourseElement from '@components/Pages/Trail/TrailCourseElement'
import type { LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/features/certifications/hooks/useCertifications', () => ({
  useUserCertificateByCourse: () => ({ data: undefined, isPending: false }),
}))
vi.mock('@/lib/cache/revalidate', () => ({ revalidateTags: vi.fn() }))
vi.mock('@services/media/media', () => ({ getCourseThumbnailMediaDirectory: () => '' }))
vi.mock('@services/config/config', () => ({
  getAbsoluteUrl: (p: string) => p,
  getSiteUrl: () => 'http://localhost:3000',
}))

const courseId = '01a0910d-2963-7483-a97d-40dc56e9aa20'
const activity = (id: string, complete: boolean) => ({
  id,
  title: id,
  activity_type: 'quiz',
  available: true,
  required: true,
  complete,
  is_late: false,
  state: complete ? 'passed' : 'not_started',
  allowed_actions: [],
})
const learnerState = {
  outline: [
    { id: 'c1', index: 0, title: 'Введение', activities: [activity('a1', true), activity('a2', false)] },
    { id: 'c2', index: 1, title: 'Уроки', activities: [activity('a3', true), activity('a4', false)] },
  ],
  // BUG-318: the server's aggregate - a4 is off this learner's allowlist, so 2 of 3.
  progress: { completed_required_count: 2, total_required_count: 3, progress_pct: 66.67 },
  next_action: { id: 'start', activity_id: 'a2' },
} as unknown as LearnerCourseState

describe('TrailCourseElement progress', () => {
  it('derives N/M and % from learner-state, not from trail steps', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['learner-course', courseId, 'state'], learnerState)
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <TrailCourseElement
            course={{ course_uuid: courseId, name: 'Основы Python' } as AppCourse}
            run={{ course_total_steps: 4, steps: [] } as unknown as AppTrailRun}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByText('2 / 3 шага')).toBeInTheDocument()
  })

  // UX-232: nothing required yet reads like the landing, not «0 / 0 шагов 0%».
  it('shows the landing empty state for a course with no required steps', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['learner-course', courseId, 'state'], {
      outline: [],
      progress: { completed_required_count: 0, total_required_count: 0, progress_pct: 0 },
      next_action: { id: 'none', activity_id: null },
    } as unknown as LearnerCourseState)
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <TrailCourseElement
            course={{ course_uuid: courseId, name: 'Пустой курс' } as AppCourse}
            run={{ course_total_steps: 0, steps: [] } as unknown as AppTrailRun}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText(ruMessages.CoursePage.noPublishedActivities)).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  // UX-252: «Сертификат недоступен» only when the course certifies but has not issued.
  it.each([
    [false, false],
    [true, true],
  ])('completed course with certificate.configured=%s shows the unavailable row: %s', (configured, shown) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['learner-course', courseId, 'state'], {
      outline: [],
      progress: { completed_required_count: 2, total_required_count: 2, progress_pct: 100 },
      next_action: { id: 'review_completion', activity_id: null },
      certificate: { configured, eligible: configured, issued: false },
    } as unknown as LearnerCourseState)
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
          <TrailCourseElement
            course={{ course_uuid: courseId, name: 'Основы Python' } as AppCourse}
            run={{ course_total_steps: 2, steps: [] } as unknown as AppTrailRun}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(Boolean(screen.queryByText(ruMessages.Trail.noCertificateAvailable))).toBe(shown)
  })
})
