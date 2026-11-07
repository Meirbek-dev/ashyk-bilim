import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import type { ChartDatum } from '#/shared/components/charts/chart-data'

import { TrendAxis } from './trend-axis'
import { HEIGHT, LEFT, trendScale } from './trend-scale'
import { TrendSeries } from './trend-series'

type TrendPlotProps = {
  title: string
  /** In time order; `label` is the formatted bucket date. */
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
}

/** The plot itself: measured to its box, read by pointer and by arrow keys, with a tooltip on the active point. */
export function TrendPlot({ title, data, formatValue }: TrendPlotProps) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const element = box.current
    if (!element) return undefined
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale = trendScale(data, width)
  const { last, plotWidth, xAt } = scale
  const point = active === null ? undefined : data[active]

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    setActive(Math.min(last, Math.max(0, Math.round(((x - LEFT) / plotWidth) * last))))
  }
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const from = active ?? last
    const next = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[event.key]
    if (event.key === 'Escape') setActive(null)
    if (next === undefined) return
    event.preventDefault()
    setActive(Math.min(last, Math.max(0, next)))
  }

  return (
    <div ref={box} className="relative" style={{ height: HEIGHT }}>
      {width > 0 ? (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the plot is read by pointer and arrow keys; it is the one focus stop of the chart
        <svg
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG drawing named as one image; there is no img tag for inline vector marks
          role="img"
          aria-label={title}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard users step through the points with the arrow keys
          tabIndex={0}
          width={width}
          height={HEIGHT}
          className="block touch-pan-y rounded-sm text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onFocus={event => {
            if (event.currentTarget.matches(':focus-visible')) setActive(last)
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          <TrendAxis data={data} scale={scale} formatValue={formatValue} />
          <TrendSeries data={data} scale={scale} formatValue={formatValue} active={active} />
        </svg>
      ) : null}
      {point && active !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col rounded-md border bg-popover px-2.5 py-1.5 whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: Math.min(width - 48, Math.max(48, xAt(active))) }}
        >
          <span className="font-heading text-base font-semibold tabular-nums">{formatValue(point.value)}</span>
          <span className="text-xs text-muted-foreground">{point.label}</span>
        </div>
      ) : null}
    </div>
  )
}
