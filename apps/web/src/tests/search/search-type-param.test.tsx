/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'

const { connection } = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/server', () => ({ connection }))
vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => `General.${key}` }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('q=js&type=foo'),
}))
vi.mock('@components/ui/AppLink', () => ({ default: 'a' }))
vi.mock('@/features/search/hooks/useSearch', () => ({
  useSearchContent: () => ({
    data: { data: { courses: [], collections: [], users: [] } },
    isPending: false,
    error: null,
  }),
}))

import PlatformSearchPage, { generateMetadata } from '@/app/[locale]/(platform)/(withmenu)/search/page'
import { parseSearchType } from '@/features/search/search-type'

describe('/search ?type=', () => {
  it('maps unknown values to all', () => {
    expect(parseSearchType('foo')).toBe('all')
    expect(parseSearchType(null)).toBe('all')
    expect(parseSearchType('users')).toBe('users')
  })

  // BUG-382: an unknown type crashed the page and titled the tab «General.foo».
  it('renders and titles an unknown type as a plain search', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: 'ru' }),
      searchParams: Promise.resolve({ q: 'js', type: 'foo' }),
    })
    expect(String(meta.title)).toMatch(/^General\.searchResults: js - /)
    render(await PlatformSearchPage())
    expect(screen.getByText('noResultsTitle')).toBeInTheDocument()
    // UX-310: the page carries a request-time marker for its URL-reading metadata.
    await waitFor(() => expect(connection).toHaveBeenCalled())
  })
})
