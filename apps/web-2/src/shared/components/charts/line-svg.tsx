import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'

import { CHART_CLASS, CHART_HEIGHT, type ChartSvgProps, countTick, SERIES_COLOR } from './chart-data'

/**
 * The heavy half of TimeSeries (loaded lazily): one ordered series as a line with its points. @tanstack/charts renders
 * SVG with role="img", the accessible name and keyboard focus over the points.
 */
export function LineSvg({ label, data, formatValue }: ChartSvgProps) {
  const definition = defineChart({
    marks: [lineY(data, { x: 'label', y: 'value', points: true, stroke: SERIES_COLOR })],
    scales: {
      x: { scale: () => scalePoint().padding(0.2), axis: { tickLabels: { thin: true } } },
      y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 4, format: countTick(formatValue) } } },
    },
    tooltip,
  })
  return <Chart definition={definition} height={CHART_HEIGHT} ariaLabel={label} className={CHART_CLASS} />
}
