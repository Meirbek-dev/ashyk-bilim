import { useId, type ReactNode } from 'react'

const tones = {
  success: 'text-success',
  destructive: 'text-destructive',
  neutral: 'text-muted-foreground',
}

type KpiTileProps = {
  label: string
  /** The formatted value: always text, never only a picture. */
  value: string
  /** The change line ("+12 % · better"): its words carry the meaning, the tone is the second channel. */
  change?: string | undefined
  tone?: keyof typeof tones
  /** A link under the value (the rows behind it). */
  action?: ReactNode
}

/** One key number of a dashboard (DESIGN 3: color with a label, numbers in tabular figures). */
export function KpiTile({ label, value, change, tone = 'neutral', action }: KpiTileProps) {
  const labelId = useId()
  return (
    <section
      aria-labelledby={labelId}
      className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <p id={labelId} className="text-sm text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {change ? <p className={`text-xs tabular-nums ${tones[tone]}`}>{change}</p> : null}
      {action ? <div className="text-sm">{action}</div> : null}
    </section>
  )
}
