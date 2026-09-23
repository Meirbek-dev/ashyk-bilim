/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import { APIError } from '@/lib/api/assertSuccess'

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('q=%5C'),
}))
vi.mock('@components/ui/AppLink', () => ({ default: 'a' }))
vi.mock('@/features/search/hooks/useSearch', () => ({
  useSearchContent: () => ({
    data: undefined,
    isPending: false,
    error: new APIError({ message: 'boom', status: 500, code: 'internal-error' }),
  }),
}))

import SearchPage from '@/app/_shared/withmenu/search/search'

// BUG-249: a failed query renders an error, not «searching…» or «no results».
describe('search page on a failed query', () => {
  it('shows the error state', () => {
    render(<SearchPage />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('searching')).toBeNull()
    expect(screen.queryByText('noResultsTitle')).toBeNull()
    expect(screen.queryByText('resultsFound')).toBeNull()
  })
})
