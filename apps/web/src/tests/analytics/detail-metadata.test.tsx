import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { APIError } from '@/lib/api/assertSuccess'
import { AnalyticsBoundary } from '@/app/[locale]/(platform)/dash/analytics/_components/AnalyticsPage'
import CourseDetailPage, {
  generateMetadata as courseMetadata,
} from '@/app/[locale]/(platform)/dash/analytics/courses/[courseuuid]/page'
import { generateMetadata as assessmentMetadata } from '@/app/[locale]/(platform)/dash/analytics/assessments/[assessmentType]/[assessmentId]/page'

const mocks = vi.hoisted(() => ({
  getTeacherCourseDetailByUuid: vi.fn(),
  getTeacherAssessmentDetail: vi.fn(),
}))

vi.mock('@services/analytics/teacher', async importOriginal => ({
  ...(await importOriginal<typeof import('@services/analytics/teacher')>()),
  getTeacherCourseDetailByUuid: mocks.getTeacherCourseDetailByUuid,
  getTeacherAssessmentDetail: mocks.getTeacherAssessmentDetail,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
  getFormatter: vi.fn(),
  getLocale: vi.fn(async () => 'kk'),
}))

const COURSE = '0199a9a4-adae-771b-ba99-a5e1ff28da30'
const EXAM = '019dde15-522b-70c8-96d4-3c3b97a27e93'
const notFound = new APIError({ status: 404, code: 'not-found', message: 'not found' })

// UX-241: titles come from the scoped analytics read, never a public read; a
// foreign or unknown id gets the not-found title like the page it renders.
describe('analytics detail metadata', () => {
  beforeEach(() => vi.clearAllMocks())

  it('names an in-scope course and assessment', async () => {
    mocks.getTeacherCourseDetailByUuid.mockResolvedValue({ course: { name: 'Blender' } })
    mocks.getTeacherAssessmentDetail.mockResolvedValue({ title: 'Exam' })
    expect((await courseMetadata({ params: Promise.resolve({ courseuuid: COURSE }) })).title).toBe('Blender')
    const meta = await assessmentMetadata({ params: Promise.resolve({ assessmentType: 'exam', assessmentId: EXAM }) })
    expect(meta.title).toBe('Exam')
  })

  it('uses the not-found title for an out-of-scope or malformed id', async () => {
    mocks.getTeacherCourseDetailByUuid.mockRejectedValue(notFound)
    mocks.getTeacherAssessmentDetail.mockRejectedValue(notFound)
    expect((await courseMetadata({ params: Promise.resolve({ courseuuid: COURSE }) })).title).toBe('NotFoundPage.title')
    const meta = await assessmentMetadata({ params: Promise.resolve({ assessmentType: 'exam', assessmentId: EXAM }) })
    expect(meta.title).toBe('NotFoundPage.title')
    expect((await courseMetadata({ params: Promise.resolve({ courseuuid: 'nope' }) })).title).toBe('NotFoundPage.title')
  })

  it('renders the page data inside its own Suspense boundary', () => {
    const el = CourseDetailPage({
      params: Promise.resolve({ courseuuid: COURSE }),
      searchParams: Promise.resolve({}),
    }) as ReactElement
    expect(el.type).toBe(AnalyticsBoundary)
  })
})
