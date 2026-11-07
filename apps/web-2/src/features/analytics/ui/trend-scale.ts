import type { ChartDatum } from '#/shared/components/charts/chart-data'

export const HEIGHT = 168
export const TOP = 24
const BOTTOM = 24
export const LEFT = 30
const RIGHT = 44

/** A round top for the axis, so its figure reads as a scale and not as the peak again. */
function niceTop(max: number) {
  if (max <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].find(candidate => candidate * power >= max) ?? 10
  return step * power
}

/** The plot's geometry for a measured width: where each point sits, the path of the line and its wash, the scale ticks. */
export function trendScale(data: readonly ChartDatum[], width: number) {
  const last = data.length - 1
  const plotWidth = Math.max(width - LEFT - RIGHT, 1)
  const plotBottom = HEIGHT - BOTTOM
  const top = niceTop(Math.max(...data.map(datum => datum.value)))
  const xAt = (index: number) => LEFT + (last > 0 ? (index / last) * plotWidth : plotWidth / 2)
  const yAt = (value: number) => plotBottom - (value / top) * (plotBottom - TOP)
  const line = data.map((datum, index) => `${index === 0 ? 'M' : 'L'}${xAt(index)} ${yAt(datum.value)}`).join(' ')
  const wash = `${line} L${xAt(last)} ${plotBottom} L${xAt(0)} ${plotBottom} Z`
  // Counts stop on whole numbers: a mark at «1,5 learners» says nothing.
  const ticks = [top, ...(Number.isInteger(top / 2) ? [top / 2] : [])]
  return { last, plotWidth, plotBottom, xAt, yAt, line, wash, ticks }
}

export type TrendScale = ReturnType<typeof trendScale>
