/** @vitest-environment jsdom */
// BUG-165: the course-end page counted lesson-only trail steps, so a course
// with a quiz never reached the completed view. It reads learner-state now.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import CourseEndView from '@components/Pages/Activity/CourseEndView'
import { learnerCourseStateQueryOptions, type LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('@/stores/gamification', () => ({ useGamificationStore: (selector: (s: unknown) => unknown) =>
  selector({ profile: null, refetch: null, dashboard: null }) }))
vi.mock('@/features/certifications/hooks/useCertifications', () => ({
  useUserCertificateByCourse: () => ({ data: null, isPending: false, error: null }),
}))
vi.mock('@/features/certifications/utils/pdfmeCertificate', () => ({}))
vi.mock('@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview', () => ({ default: () => null }))

const courseId = '11111111-1111-4111-8111-111111111111'
function state(): LearnerCourseState {
  const activity = (id: string, activity_type: 'dynamic' | 'quiz') => ({
    id, title: id, activity_type, available: true, required: true, complete: true, is_late: false,
    state: 'complete' as const, allowed_actions: [],
  })
  return {
    course_id: courseId, title: 'Course', public: true, enrolled: true, enrollment_state: 'completed',
    certificate: { configured: false, eligible: true, issued: false },
    next_action: { id: 'review_completion', enabled: true, label: '', reason: '' },
    permissions: { can_access: true, can_discover: true, can_enroll: false },
    progress: { completed_at_unix: 1_700_000_000, completed_required_count: 5, missing_required_count: 0,
      needs_grading_count: 0, progress_pct: 100, total_required_count: 5 },
    outline: [{ id: 'ch', index: 0, title: 'Chapter', activities: [
      activity('l1', 'dynamic'), activity('l2', 'dynamic'), activity('l3', 'dynamic'),
      activity('q1', 'quiz'), activity('q2', 'quiz'),
    ] }],
  }
}

function renderView(learnerState: LearnerCourseState) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(learnerCourseStateQueryOptions(courseId).queryKey, learnerState)
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <CourseEndView courseName="Course" courseUuid={courseId} thumbnailImage="" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

describe('CourseEndView (BUG-165)', () => {
  it('3 lessons + 2 quizzes all done → completed view with «5 из 5»', () => {
    renderView(state())
    expect(screen.getByText(/Поздравляем!/)).toBeInTheDocument()
    expect(screen.getByText('5 из 5 учебных задач выполнено')).toBeInTheDocument()
    expect(screen.queryByText(/Так держать!/)).toBeNull()
  })

  it('in progress → «N из M» from learner-state, not the trail', () => {
    const s = state()
    s.enrollment_state = 'in_progress'
    s.progress = { ...s.progress, completed_at_unix: null, completed_required_count: 3, progress_pct: 60 }
    renderView(s)
    expect(screen.getByText(/Так держать!/)).toBeInTheDocument()
    expect(screen.getByText('3 из 5 учебных задач выполнено')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })
})
