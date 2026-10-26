import { lazy } from 'react'

import type { ChartDatum } from './chart-data'
import { ChartFigure } from './chart-figure'

const BarsSvg = lazy(() => import('./bars-svg').then(module => ({ default: module.BarsSvg })))

type BarsProps = {
  title: string
  /** One bar per category, in display order. */
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
  /** Said instead of the chart when every count is 0. */
  empty?: string | undefined
}

/** Counts per category: a bar chart plus its values as text. */
export function Bars({ title, data, formatValue, empty }: BarsProps) {
  return (
    <ChartFigure title={title} data={data} formatValue={formatValue} empty={empty}>
      <BarsSvg label={title} data={data} formatValue={formatValue} />
    </ChartFigure>
  )
}
