import type { ReactNode } from 'react'

/** A settings section's heading and its one line. */
export function SectionMargin({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold wrap-break-word">{title}</h2>
      <p className="text-sm text-pretty text-muted-foreground">{description}</p>
    </div>
  )
}
