type ScoreBarProps = {
  /** 0..100: where the bar ends. */
  value: number
  /** The value as text, beside the bar: the bar is a picture, the number is the data. */
  text: string
}

/** A score in a table cell as a short bar plus its number, so a column of scores reads at a glance (a ranking). */
export function ScoreBar({ value, text }: ScoreBarProps) {
  const width = Math.min(100, Math.max(0, value))
  return (
    <span className="flex items-center gap-2">
      <svg aria-hidden viewBox="0 0 100 6" preserveAspectRatio="none" className="h-1.5 w-16 shrink-0">
        <rect width="100" height="6" rx="3" className="fill-muted" />
        {width > 0 ? <rect width={Math.max(width, 6)} height="6" rx="3" className="fill-chart-1" /> : null}
      </svg>
      <span className="tabular-nums">{text}</span>
    </span>
  )
}
