import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { APIError } from '@/lib/api/assertSuccess'
import { AnalyticsPageContent } from '@/app/[locale]/(platform)/dash/analytics/_components/AnalyticsPage'

const mocks = vi.hoisted(() => ({
  getTeacherOverview: vi.fn(),
  getAdminAnalyticsOverview: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@services/analytics/teacher', async importOriginal => ({
  ...(await importOriginal<typeof import('@services/analytics/teacher')>()),
  getTeacherOverview: mocks.getTeacherOverview,
  getAdminAnalyticsOverview: mocks.getAdminAnalyticsOverview,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `translated:${key}`),
}))

vi.mock('@/i18n/navigation', () => ({ redirect: mocks.redirect }))

describe('shared analytics page loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTeacherOverview.mockResolvedValue({})
    mocks.getAdminAnalyticsOverview.mockResolvedValue({})
  })

  it('redirects an unauthorized admin route to the overview with its filters', async () => {
    mocks.getAdminAnalyticsOverview.mockRejectedValue(
      new APIError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' }),
    )

    const result = await AnalyticsPageContent({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ window: '7d', course_ids: '42' }),
      activeTab: 'admin',
      renderTab: vi.fn(),
      requireAdmin: true,
    })

    expect(mocks.redirect).toHaveBeenCalledWith({
      href: '/dash/analytics/overview?window=7d&compare=previous_period&bucket=day&course_ids=42&timezone=UTC',
      locale: 'en',
    })
    expect(result).toBeNull()
  })

  it('renders the shared empty state when analytics loading fails', async () => {
    mocks.getTeacherOverview.mockRejectedValue(new Error('Analytics unavailable'))

    const result = (await AnalyticsPageContent({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
      activeTab: 'overview',
      renderTab: vi.fn(),
    })) as ReactElement<{ description: string; title: string }>

    expect(result.props).toMatchObject({
      title: 'translated:pages.overviewDisabledTitle',
      description: 'Analytics unavailable',
    })
  })
})
