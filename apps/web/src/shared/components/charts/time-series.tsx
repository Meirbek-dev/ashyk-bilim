import { lazy } from 'react'

import type { ChartDatum } from './chart-data'
import { ChartFigure } from './chart-figure'

const LineSvg = lazy(() => import('./line-svg').then(module => ({ default: module.LineSvg })))

type TimeSeriesProps = {
  title: string
  /** In time order; `label` is the formatted bucket date (`formatDayMonth`). */
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
}

/** One measure over time: a line chart plus its values as text. */
export function TimeSeries({ title, data, formatValue }: TimeSeriesProps) {
  return (
    <ChartFigure title={title} data={data} formatValue={formatValue}>
      <LineSvg label={title} data={data} formatValue={formatValue} />
    </ChartFigure>
  )
}
