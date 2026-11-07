import type { ChartDatum } from '#/shared/components/charts/chart-data'

import { TOP, type TrendScale } from './trend-scale'

type TrendSeriesProps = {
  data: readonly ChartDatum[]
  scale: TrendScale
  formatValue: (value: number) => string
  /** The index under the pointer or the keyboard focus. */
  active: number | null
}

/** The line over its wash, the peak and last values labelled on it, and the marker of the active point. */
export function TrendSeries({ data, scale, formatValue, active }: TrendSeriesProps) {
  const { last, plotBottom, xAt, yAt, line, wash } = scale
  const end = data[last]
  const peak = data.reduce((best, datum, index) => (datum.value > (data[best]?.value ?? 0) ? index : best), 0)
  const peakDatum = data[peak]
  // The peak gets its figure only where it says something the end label does not.
  const showPeak = peakDatum && peak !== last && peakDatum.value > 0 && xAt(last) - xAt(peak) > 32
  const point = active === null ? undefined : data[active]
  return (
    <>
      {last > 0 ? <path d={wash} className="fill-chart-1 opacity-10" /> : null}
      <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-chart-1" />
      {showPeak ? (
        <text
          x={xAt(peak)}
          y={yAt(peakDatum.value) - 8}
          textAnchor="middle"
          className="fill-muted-foreground tabular-nums"
        >
          {formatValue(peakDatum.value)}
        </text>
      ) : null}
      {end ? (
        <>
          <circle cx={xAt(last)} cy={yAt(end.value)} r={4} strokeWidth={2} className="fill-chart-1 stroke-background" />
          <text
            x={xAt(last) + 10}
            y={yAt(end.value)}
            dy="0.32em"
            className="fill-foreground font-heading text-sm font-semibold tabular-nums"
          >
            {formatValue(end.value)}
          </text>
        </>
      ) : null}
      {point && active !== null ? (
        <>
          <line x1={xAt(active)} x2={xAt(active)} y1={TOP - 8} y2={plotBottom} className="stroke-muted-foreground/60" />
          <circle
            cx={xAt(active)}
            cy={yAt(point.value)}
            r={4}
            strokeWidth={2}
            className="fill-chart-1 stroke-background"
          />
        </>
      ) : null}
    </>
  )
}
