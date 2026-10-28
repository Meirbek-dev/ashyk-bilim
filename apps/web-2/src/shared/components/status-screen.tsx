import type { ReactNode } from 'react'

import { CourseCover } from './course-cover'

type StatusScreenProps = {
  /** What happened, as the page heading: «Страница не найдена», «Нет доступа». */
  title: string
  /** One sentence on why and what to do next. */
  text?: string
  /** The way on: one primary action first, then quieter ones. */
  children?: ReactNode
}

/**
 * A page that cannot show its object (not found, no access, an error): the brand emblem, the heading, one sentence and
 * the way on. Every such page looks the same, so a dead link never reads as a broken app.
 */
export function StatusScreen({ title, text, children }: StatusScreenProps) {
  return (
    <section className="flex flex-col items-start gap-gutter py-8 sm:flex-row sm:items-center sm:gap-12 sm:py-16">
      <CourseCover seed={title} tone={0} shape="panel" className="aspect-4/5 w-24 shrink-0 rounded-xl border sm:w-40" />
      <div className="flex max-w-prose flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {text ? <p className="text-muted-foreground">{text}</p> : null}
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </section>
  )
}
