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
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ru',
  // ru digits: «100» and «66,7» — the decimal comma is the tell.
  useFormatter: () => ({ number: (value: number, opts?: { maximumFractionDigits?: number }) =>
    value.toFixed(opts?.maximumFractionDigits ?? 0).replace(/\.?0+$/, '').replace('.', ',') }),
}))
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

  // UX-137: every number on the tab goes through the shared percent format
  // (locale decimals, no «100.0%» beside «100%»), and the item-analytics type
  // column shows the kind label, never the raw «CHOICE».
  it('formats percents through usePercentFormat and labels item kinds', () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = JSON.stringify(queryKey)
      if (key.includes('submission-stats')) {
        return { isSuccess: true, data: { total: 1, needs_grading_count: 0, avg_score: 100, pass_rate: 66.666, distribution: [] }, refetch: vi.fn() }
      }
      if (key.includes('item-analytics')) {
        return {
          isSuccess: true,
          isError: false,
          data: [{ item_id: 'i1', title: 'Q1', kind: 'choice', response_count: 1, correct_pct: 100, discrimination_index: null }],
          refetch: vi.fn(),
        }
      }
      return { isSuccess: false, data: undefined, refetch: vi.fn() }
    })
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ResultsReviewTab assessmentUuid="asm-1" activityUuid="act-1" courseUuid="course-1" />
      </QueryClientProvider>,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('66,67%')
    expect(text).not.toMatch(/100\.0%/)
    expect(text).toContain('kindLabels.choice')
    expect(text).not.toContain('CHOICE')
  })
})
