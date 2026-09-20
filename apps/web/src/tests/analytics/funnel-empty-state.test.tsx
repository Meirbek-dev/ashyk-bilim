/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, render, screen } from '@testing-library/react'
import CompletionFunnelChart from '@/components/Dashboard/Analytics/CompletionFunnelChart'
import AnalyticsMultiSeriesTrendChart from '@/components/Dashboard/Analytics/AnalyticsMultiSeriesTrendChart'
import EngagementAreaChart from '@/components/Dashboard/Analytics/EngagementAreaChart'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ru',
  useFormatter: () => ({ number: (v: number) => v.toLocaleString('ru-RU') }),
}))

// jsdom gives recharts no size, so nothing mounts: render the chart tree bare and capture the axis props.
const { axes, passthrough, none } = vi.hoisted(() => ({
  axes: {} as Record<string, Record<string, unknown>>,
  passthrough: ({ children }: { children?: React.ReactNode }) => children,
  none: () => null,
}))
vi.mock('@/components/ui/chart', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/ui/chart')>()),
  ChartContainer: passthrough,
  ChartTooltip: none,
}))
vi.mock('recharts', () => ({
  BarChart: passthrough,
  AreaChart: passthrough,
  Bar: none,
  Area: none,
  CartesianGrid: none,
  Legend: none,
  Tooltip: none,
  XAxis: (props: Record<string, unknown>) => ((axes.x = props), null),
  YAxis: (props: Record<string, unknown>) => ((axes.y = props), null),
}))

afterEach(cleanup)

describe('UX-075 funnel chart', () => {
  it('renders empty-state copy instead of a blank chart when there are no steps', () => {
    render(<CompletionFunnelChart title="Отсев по главам" description="" data={[]} />)
    expect(screen.getByText('funnel.empty')).toBeTruthy()
    expect(document.querySelector('[data-slot="chart"]')).toBeNull()
  })
})

describe('UX-138 learner-count axes', () => {
  const integerLocaleTicks = (axis: Record<string, unknown>) => {
    expect(axis.allowDecimals).toBe(false)
    expect((axis.tickFormatter as (v: number) => string)(1000)).toBe((1000).toLocaleString('ru-RU'))
  }

  it('funnel count axis renders integer ticks with locale digits', () => {
    render(<CompletionFunnelChart title="" description="" data={[{ label: 'Глава 1', count: 3 } as never]} />)
    integerLocaleTicks(axes.x!)
  })

  it('trend learner axis renders integer ticks with locale digits', () => {
    render(
      <AnalyticsMultiSeriesTrendChart
        title=""
        description=""
        data={[
          {
            bucket_start: '2026-09-01',
            bucket: '1 сен',
            active_learners: 3,
            completions: 1,
            submissions: 2,
            grading_completed: 1,
          },
        ]}
      />,
    )
    integerLocaleTicks(axes.y!)
  })

  it('course-detail engagement axis renders integer ticks with locale digits', () => {
    render(<EngagementAreaChart title="" description="" data={[{ bucket_start_unix: 1_756_684_800, value: 2 }]} />)
    integerLocaleTicks(axes.y!)
  })
})
