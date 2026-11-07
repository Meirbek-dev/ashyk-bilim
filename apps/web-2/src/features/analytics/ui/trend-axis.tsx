import type { ChartDatum } from '#/shared/components/charts/chart-data'

import { HEIGHT, LEFT, type TrendScale } from './trend-scale'

type TrendAxisProps = {
  data: readonly ChartDatum[]
  scale: TrendScale
  formatValue: (value: number) => string
}

/** The hairline scale of the plot: tick figures with their rules, the baseline, and the first and last bucket dates. */
export function TrendAxis({ data, scale, formatValue }: TrendAxisProps) {
  const { last, plotWidth, plotBottom, xAt, yAt, ticks } = scale
  const end = data[last]
  return (
    <>
      {ticks.map(tick => (
        <g key={tick}>
          <line x1={LEFT} x2={LEFT + plotWidth} y1={yAt(tick)} y2={yAt(tick)} className="stroke-border" />
          <text x={0} y={yAt(tick)} dy="0.32em" className="fill-muted-foreground tabular-nums">
            {formatValue(tick)}
          </text>
        </g>
      ))}
      <text x={0} y={plotBottom} dy="0.32em" className="fill-muted-foreground tabular-nums">
        {formatValue(0)}
      </text>
      <line x1={LEFT} x2={LEFT + plotWidth} y1={plotBottom} y2={plotBottom} className="stroke-muted-foreground/60" />
      {data[0] ? (
        <text x={LEFT} y={HEIGHT - 4} className="fill-muted-foreground">
          {data[0].label}
        </text>
      ) : null}
      {end && last > 0 ? (
        <text x={xAt(last)} y={HEIGHT - 4} textAnchor="end" className="fill-muted-foreground">
          {end.label}
        </text>
      ) : null}
    </>
  )
}
