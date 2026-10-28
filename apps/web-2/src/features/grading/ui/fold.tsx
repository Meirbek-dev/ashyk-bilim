import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

type FoldProps = { title: string; onToggle?: (open: boolean) => void; children: ReactNode }

/** A folded section of the review (history, task instructions): a heading-sized summary with a turning chevron. */
export function Fold({ title, onToggle, children }: FoldProps) {
  return (
    <details className="group flex flex-col gap-2" onToggle={event => onToggle?.(event.currentTarget.open)}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-5 transition-transform duration-150 group-open:rotate-90" />
        {/* A real section heading: the same face as «Ответы» above it, and in the screen reader's heading list. */}
        <h2 className="text-xl font-semibold">{title}</h2>
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}
