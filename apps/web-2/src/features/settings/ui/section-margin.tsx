import type { ReactNode } from 'react'

/** The heading and its one line, hung in the margin of a settings section. */
export function SectionMargin({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 @4xl:sticky @4xl:top-20 @4xl:self-start">
      <h2 className="text-xl font-semibold wrap-break-word">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
