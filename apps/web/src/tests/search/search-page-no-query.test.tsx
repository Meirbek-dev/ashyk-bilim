/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('type=courses'),
}))
vi.mock('@components/ui/AppLink', () => ({ default: 'a' }))
// The hook is disabled without a query: idle, no data.
vi.mock('@/features/search/hooks/useSearch', () => ({
  useSearchContent: () => ({ data: undefined, isPending: true, error: null }),
}))

import SearchPage from '@/app/_shared/withmenu/search/search'

// UX-319: a type without a query is the pre-search state, not «nothing found for «»».
describe('search page with a type and no query', () => {
  it('shows no empty-result copy and no (0) counts', () => {
    render(<SearchPage />)
    expect(screen.queryByText('noFilterResults.courses')).toBeNull()
    expect(screen.queryByText('noResultsTitle')).toBeNull()
    expect(screen.queryByText('(0)')).toBeNull()
  })
})
