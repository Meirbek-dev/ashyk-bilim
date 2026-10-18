import { areaY, defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'

import { CHART_CLASS, CHART_HEIGHT, type ChartSvgProps, countTick, SERIES_COLOR } from './chart-data'

/**
 * The heavy half of TimeSeries (loaded lazily): one ordered series as a line over a faint wash of its own color, no
 * dot per day (a month of dots on a flat zero line is noise); the tooltip names the point under the pointer.
 * @tanstack/charts renders SVG with role="img", the accessible name and keyboard focus over the points.
 */
export function LineSvg({ label, data, formatValue }: ChartSvgProps) {
  const definition = defineChart({
    marks: [
      areaY(data, { x: 'label', y: 'value', fill: SERIES_COLOR, fillOpacity: 0.12 }),
      lineY(data, { x: 'label', y: 'value', stroke: SERIES_COLOR, strokeWidth: 2 }),
    ],
    scales: {
      x: { scale: () => scalePoint().padding(0.2), axis: { tickLabels: { thin: true } } },
      y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 4, format: countTick(formatValue) } } },
    },
    tooltip,
  })
  return <Chart definition={definition} height={CHART_HEIGHT} ariaLabel={label} className={CHART_CLASS} />
}
