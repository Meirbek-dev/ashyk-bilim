/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// The studio results view sat on stale «Сдачи N» for as long as the tab was
// open (UX-085): the client disables refetch-on-focus globally and no SSE is
// mounted in the studio, so the queue and its stats must poll on their own.

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }))

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.useQuery,
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'ru' }))
vi.mock('recharts', () => ({
  Bar: () => null,
  BarChart: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))
vi.mock('@/features/grading/review/components/ReviewBulkActionBar', () => ({ default: () => null }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

import ResultsReviewTab from '@/features/assessments/studio/tabs/ResultsReviewTab'

describe('studio results view', () => {
  it('polls the submissions queue and stats on focus and every 30 s', () => {
    mocks.useQuery.mockReturnValue({ isSuccess: false, data: undefined, refetch: vi.fn() })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ResultsReviewTab assessmentUuid="asm-1" activityUuid="act-1" courseUuid="course-1" />
      </QueryClientProvider>,
    )

    const options = mocks.useQuery.mock.calls.map(([option]) => option as Record<string, unknown>)
    const live = options.filter(option => option.refetchInterval === 30_000 && option.refetchOnWindowFocus === true)
    expect(live.map(option => JSON.stringify(option.queryKey))).toEqual([
      JSON.stringify(['grading', 'submission-stats', 'asm-1']),
      expect.stringContaining('"submissions"'),
    ])
    expect(live.every(option => option.refetchIntervalInBackground === false)).toBe(true)
  })
})
