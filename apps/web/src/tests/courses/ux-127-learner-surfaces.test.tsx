/** @vitest-environment jsdom */
// UX-127: a completed course card follows the server's `next_action`; the
// course-end page promises a certificate only when one is configured and has
// a single primary at 0/0; a video activity without a source shows the
// «Нет содержимого» empty state instead of a blank viewer.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail'
import CourseEndView from '@components/Pages/Activity/CourseEndView'
import VideoActivity from '@components/Objects/Activities/Video/Video'
import { learnerCourseStateQueryOptions, type LearnerCourseState } from '@/features/learner-course/api'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/i18n/navigation', () => ({ Link: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    session: { roles: ['user'], permissions: [] },
    user: { id: 'u1' },
    isAuthenticated: true,
    can: () => false,
  }),
}))
vi.mock('@services/media/media', () => ({
  getCourseThumbnailMediaDirectory: () => '',
  getUserAvatarMediaDirectory: () => '',
  getActivityMediaDirectory: () => '',
}))
vi.mock('@services/config/config', () => ({
  getAbsoluteUrl: (p: string) => p,
  getSiteUrl: () => 'http://localhost:3000',
}))
vi.mock('@services/courses/course-delete', () => ({ deleteCourseFromBackend: vi.fn() }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('@/stores/gamification', () => ({
  useGamificationStore: (selector: (s: unknown) => unknown) =>
    selector({ profile: null, refetch: null, dashboard: null }),
}))
vi.mock('@/features/certifications/hooks/useCertifications', () => ({
  useUserCertificateByCourse: () => ({ data: null, isPending: false, error: null }),
}))
vi.mock('@/features/certifications/utils/pdfmeCertificate', () => ({}))
vi.mock('@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview', () => ({
  default: () => null,
}))
vi.mock('@components/Objects/Activities/Video/Artplayer', () => ({ default: () => <div>player</div> }))
vi.mock('@/components/ui/youtube-embed-fill', () => ({ YouTubeEmbedFill: () => <div>youtube</div> }))

const courseId = '01a0910d-2963-7483-a97d-40dc56e9aa20'

function state(overrides: Partial<LearnerCourseState>): LearnerCourseState {
  return {
    course_id: courseId,
    title: 'Course',
    public: true,
    enrolled: true,
    enrollment_state: 'completed',
    certificate: { configured: true, eligible: true, issued: true, href: '/certificates/abc/verify' },
    next_action: { id: 'view_certificate', enabled: true, label: '', reason: '' },
    permissions: { can_access: true, can_discover: true, can_enroll: false },
    progress: {
      completed_at_unix: 1_700_000_000,
      completed_required_count: 1,
      missing_required_count: 0,
      needs_grading_count: 0,
      progress_pct: 100,
      total_required_count: 1,
    },
    outline: [
      {
        id: 'ch',
        index: 0,
        title: 'Chapter',
        activities: [
          {
            id: 'a1',
            title: 'a1',
            activity_type: 'dynamic',
            available: true,
            required: true,
            complete: true,
            is_late: false,
            state: 'complete',
            allowed_actions: [],
          },
        ],
      },
    ],
    ...overrides,
  } as LearnerCourseState
}

function withState(learnerState: LearnerCourseState | null, ui: React.ReactNode) {
  const queryClient = new QueryClient()
  if (learnerState) queryClient.setQueryData(learnerCourseStateQueryOptions(courseId).queryKey, learnerState)
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

describe('UX-127 learner surfaces', () => {
  it('completed course card follows next_action view_certificate', () => {
    withState(
      state({}),
      <CourseThumbnail
        course={{ course_uuid: courseId, name: 'Основы Python' }}
        trailData={{ runs: [{ course: { course_uuid: courseId }, steps: [] }] } as unknown as AppTrailData}
      />,
    )
    const cta = screen.getByRole('button', { name: 'Просмотреть сертификат' })
    expect(cta).toHaveAttribute('href', '/certificates/abc/verify')
    expect(screen.queryByText('Продолжить обучение')).toBeNull()
  })

  it('course end in progress without a configured certificate does not promise one', () => {
    withState(
      state({
        enrollment_state: 'in_progress',
        certificate: { configured: false, eligible: false, issued: false },
        next_action: { id: 'continue', enabled: true, label: '', reason: '' },
        progress: {
          completed_at_unix: null,
          completed_required_count: 0,
          missing_required_count: 1,
          needs_grading_count: 0,
          progress_pct: 0,
          total_required_count: 1,
        },
      }),
      <CourseEndView courseName="Course" courseUuid={courseId} thumbnailImage="" />,
    )
    expect(screen.getByText(/Так держать!/)).toBeInTheDocument()
    expect(screen.queryByText(/сертификат/)).toBeNull()
    expect(screen.getByText('Продолжить обучение')).toBeInTheDocument()
  })

  it('course end at 0/0 live activities has no card CTA', () => {
    withState(
      state({
        enrollment_state: 'in_progress',
        certificate: { configured: false, eligible: false, issued: false },
        next_action: { id: 'none', enabled: false, label: '', reason: '' },
        progress: {
          completed_at_unix: null,
          completed_required_count: 0,
          missing_required_count: 0,
          needs_grading_count: 0,
          progress_pct: 0,
          total_required_count: 0,
        },
        outline: [],
      }),
      <CourseEndView courseName="Course" courseUuid={courseId} thumbnailImage="" />,
    )
    expect(screen.getByText('В этом курсе пока нет опубликованных уроков')).toBeInTheDocument()
    expect(screen.queryByText(/Так держать!/)).toBeNull()
    expect(screen.queryByText('Продолжить обучение')).toBeNull()
    expect(screen.queryByText(/0 из 0/)).toBeNull()
  })

  it('video activity without a source shows the empty state', () => {
    withState(
      null,
      <VideoActivity
        activity={{ activity_sub_type: 'SUBTYPE_VIDEO_YOUTUBE', activity_uuid: 'v1', content: {} }}
        course={{ course_uuid: courseId }}
      />,
    )
    expect(screen.getByText('Нет содержимого')).toBeInTheDocument()
    expect(screen.queryByText('youtube')).toBeNull()
  })
})
