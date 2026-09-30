import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const getSession = vi.fn()
const getAssessmentByUuid = vi.fn()
const redirectWithLocale = vi.fn()

vi.mock('@/lib/auth/session', () => ({ getSession: () => getSession() }))
vi.mock('@services/assessments/assessments', () => ({ getAssessmentByUuid: (id: string) => getAssessmentByUuid(id) }))
vi.mock('@/i18n/navigation', () => ({ redirect: (args: unknown) => redirectWithLocale(args) }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'ru',
}))

import AssessmentAttemptPage, {
  generateMetadata,
} from '@/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/page'

const props = (review?: string) => ({
  params: Promise.resolve({ assessmentUuid: 'a1' }),
  searchParams: Promise.resolve(review ? { review } : {}),
})

/** The page is a `<Suspense>` shell (UX-243); run the async content it wraps. */
const forward = (p: ReturnType<typeof props>) => {
  const content = (AssessmentAttemptPage(p) as ReactElement<{ children: ReactElement }>).props.children
  return (content.type as (props: unknown) => Promise<unknown>)(content.props)
}

beforeEach(() => vi.clearAllMocks())

// UX-229: anonymous deep links go to login with `returnTo` before the (401) fetch.
describe('/assessments/[uuid]', () => {
  it('sends an anonymous visitor to login with returnTo, without fetching', async () => {
    getSession.mockResolvedValue(null)
    await forward(props('s1'))
    expect(getAssessmentByUuid).not.toHaveBeenCalled()
    expect(redirectWithLocale).toHaveBeenCalledWith({
      href: `/login?returnTo=${encodeURIComponent('/assessments/a1?review=s1')}`,
      locale: 'ru',
    })
  })

  it('forwards to the canonical activity URL with the locale, no extra hop (UX-243)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    getAssessmentByUuid.mockResolvedValue({ course_uuid: 'c1', activity_uuid: 'act1' })
    await forward(props())
    expect(redirectWithLocale).toHaveBeenCalledWith({ href: '/course/c1/activity/act1', locale: 'ru' })
    await forward(props('s1'))
    expect(redirectWithLocale).toHaveBeenLastCalledWith({
      href: '/dash/courses/c1/activity/act1/review?submission=s1',
      locale: 'ru',
    })
  })

  it('localizes the not-found title', async () => {
    getAssessmentByUuid.mockResolvedValue(null)
    const meta = await generateMetadata(props())
    expect(meta.title).toBe('title - Ashyk Bilim')
  })
})
