import type { ReactNode } from 'react'

type PlainSectionProps = { title: string; description: string; children: ReactNode }

/** A settings section that acts at once (a list, a file pick, a switch-over), so it has no Save of its own. */
export function PlainSection({ title, description, children }: PlainSectionProps) {
  return (
    <section aria-label={title} className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
