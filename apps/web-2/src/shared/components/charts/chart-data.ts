/** One point of a chart: the category or the formatted bucket date, and its value. */
export type ChartDatum = { label: string; value: number }

export type ChartSvgProps = {
  /** The accessible name of the SVG (the figure's caption). */
  label: string
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
}

export const CHART_HEIGHT = 176
// Data color only from the theme's chart tokens, in slot order (DESIGN 2); axes and grid follow the text color.
export const SERIES_COLOR = 'var(--chart-1)'
export const CHART_CLASS = 'text-xs text-muted-foreground'

/** Axis ticks of a count: a fractional tick (0,2 learners) gets no label. */
export const countTick = (format: (value: number) => string) => (value: number) =>
  Number.isInteger(value) ? format(value) : ''
