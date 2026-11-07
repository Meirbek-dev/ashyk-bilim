import type { ChartDatum } from '#/shared/components/charts/chart-data'
import { ChartFigure } from '#/shared/components/charts/chart-figure'

type CountBarsProps = {
  title: string
  /** One bar per category, in display order. */
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
  /** Said instead of the chart when every count is 0. */
  empty?: string | undefined
}

/**
 * Counts per category, set as rows: the label on the left, a thin bar from a shared baseline, its figure at the tip, so
 * nothing is read off an axis and a long chapter name stays whole. The shared `ChartFigure` holds the caption and the table.
 */
export function CountBars({ title, data, formatValue, empty }: CountBarsProps) {
  const top = Math.max(...data.map(datum => datum.value), 1)
  return (
    <ChartFigure title={title} data={data} formatValue={formatValue} empty={empty}>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the bars are one chart named as an image; the table of values sits beside it
        role="img"
        aria-label={title}
        className="grid max-w-3xl grid-cols-[minmax(0,14rem)_minmax(0,1fr)] border-t text-sm @max-lg:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
      >
        {data.map(datum => (
          <div
            key={datum.label}
            className="col-span-2 grid grid-cols-subgrid items-center border-b py-1.5 hover:bg-accent"
          >
            <span className="pe-3 wrap-anywhere text-muted-foreground">{datum.label}</span>
            <span className="flex items-center gap-2 border-s border-muted-foreground/60">
              {/* The figure keeps its room beside the longest bar. */}
              <span
                className="h-3 rounded-e-sm bg-chart-1"
                style={{ width: `calc((100% - 3.5rem) * ${datum.value / top})` }}
              />
              <span className="tabular-nums">{formatValue(datum.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </ChartFigure>
  )
}
