import { Progress } from '@base-ui/react/progress'

/** A determinate progress bar (0-100) with an accessible name; the fill is the primary token (DESIGN 2). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <Progress.Root value={value} aria-label={label}>
      <Progress.Track className="h-2 overflow-hidden rounded-full bg-muted">
        <Progress.Indicator className="h-full bg-primary" />
      </Progress.Track>
    </Progress.Root>
  )
}
