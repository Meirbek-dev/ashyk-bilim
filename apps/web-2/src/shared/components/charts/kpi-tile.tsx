import { useId, type ReactNode } from 'react'

const tones = {
  success: 'text-success',
  destructive: 'text-destructive',
  neutral: 'text-muted-foreground',
}

type KpiTileProps = {
  label: string
  /** The formatted value: always text, never only a picture. `null`: nothing to measure yet, a quiet dash. */
  value: string | null
  /** What the dash means, for screen readers («Нет оценки»); used when `value` is null. */
  missing?: string
  /** The change line ("+12 % · better"): its words carry the meaning, the tone is the second channel. */
  change?: string | undefined
  tone?: keyof typeof tones
  /** A link under the value (the rows behind it). */
  action?: ReactNode
}

/**
 * One key number of a dashboard (DESIGN 3: color with a label, numbers in tabular figures). Not a card: a rule above
 * it, so a row of numbers reads as one strip (`KpiStrip`), not as a wall of boxes.
 */
export function KpiTile({ label, value, missing, change, tone = 'neutral', action }: KpiTileProps) {
  const labelId = useId()
  return (
    // Label, figure, change and action stand on the strip's own rows (subgrid): a label of two lines no longer drops
    // its figure below its neighbours', and an action under one tile keeps the others' feet level.
    <section
      aria-labelledby={labelId}
      className="row-span-4 grid min-w-0 grid-rows-subgrid content-start gap-y-1 border-t pt-3"
    >
      <p id={labelId} className="text-sm text-muted-foreground">
        {label}
      </p>
      {value === null ? (
        <p className="font-heading text-2xl font-semibold text-muted-foreground">
          <span aria-hidden>—</span>
          {missing ? <span className="sr-only">{missing}</span> : null}
        </p>
      ) : (
        <p className="font-heading text-2xl font-semibold tabular-nums">{value}</p>
      )}
      {change ? <p className={`row-start-3 text-xs tabular-nums ${tones[tone]}`}>{change}</p> : null}
      {action ? <div className="row-start-4 pt-1 text-sm">{action}</div> : null}
    </section>
  )
}
