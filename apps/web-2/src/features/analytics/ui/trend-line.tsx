import type { ChartDatum } from '#/shared/components/charts/chart-data'
import { ChartFigure } from '#/shared/components/charts/chart-figure'

import { TrendPlot } from './trend-plot'

type TrendLineProps = {
  title: string
  /** In time order; `label` is the formatted bucket date. */
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
}

/**
 * One measure over time, set like a figure in a book: a line over a faint wash, its last value and its peak labelled on the
 * line, a hairline scale. The shared `TimeSeries` draws a dashboard axis with a date under every tick; the caption and the
 * table of every value stay the shared `ChartFigure`'s.
 */
export function TrendLine({ title, data, formatValue }: TrendLineProps) {
  return (
    <ChartFigure title={title} data={data} formatValue={formatValue}>
      <TrendPlot title={title} data={data} formatValue={formatValue} />
    </ChartFigure>
  )
}
