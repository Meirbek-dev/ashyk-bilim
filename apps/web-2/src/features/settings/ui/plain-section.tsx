import type { ReactNode } from 'react'

import { page } from './section-page'
import { SectionMargin } from './section-margin'

type PlainSectionProps = {
  title: string
  description: ReactNode
  children: ReactNode
}

/** The same page for a section that acts at once (a list, a file pick, a switch-over), so it has no Save of its own. */
export function PlainSection({ title, description, children }: PlainSectionProps) {
  return (
    <section aria-label={title} className={page}>
      <SectionMargin title={title} description={description} />
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}
