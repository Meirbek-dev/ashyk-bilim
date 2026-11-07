/**
 * A share in a table cell: a hairline meter and its figure at a fixed width, so the bars start on one line and the figures
 * end on one line down the column (the shared `ScoreBar` lets the bar move with the width of the number).
 */
export function Meter({ value, text }: { value: number; text: string }) {
  const width = Math.min(100, Math.max(0, value))
  return (
    <span className="inline-flex items-center justify-end gap-3">
      <span aria-hidden className="block h-1 w-14 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-chart-1" style={{ width: `${width}%` }} />
      </span>
      <span className="w-[6ch] text-right tabular-nums">{text}</span>
    </span>
  )
}
