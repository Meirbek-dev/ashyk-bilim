import { barY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'

import { CHART_CLASS, CHART_HEIGHT, type ChartSvgProps, countTick, SERIES_COLOR } from './chart-data'

/** The heavy half of Bars (loaded lazily): one bar per category (a histogram, age buckets). */
export function BarsSvg({ label, data, formatValue }: ChartSvgProps) {
  const definition = defineChart({
    marks: [barY(data, { x: 'label', y: 'value', fill: SERIES_COLOR })],
    scales: {
      x: { scale: () => scaleBand().padding(0.2), axis: { tickLabels: { thin: true } } },
      y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 4, format: countTick(formatValue) } } },
    },
    tooltip,
  })
  return <Chart definition={definition} height={CHART_HEIGHT} ariaLabel={label} className={CHART_CLASS} />
}
