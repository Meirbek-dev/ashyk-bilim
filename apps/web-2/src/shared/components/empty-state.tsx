import type { ReactNode } from 'react'

type EmptyStateProps = {
  /** One sentence on what will appear here (DESIGN 7), or that nothing matched. */
  children: ReactNode
  /** The way on: the create action, «Сбросить фильтры». */
  action?: ReactNode
}

/**
 * The place of a list that has nothing to show: a quiet field as wide as the list would be, the sentence and the way
 * on in its middle. It reads as "nothing here yet", where a lone grey line under a heading read as a page that failed
 * to load.
 */
export function EmptyState({ children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-muted/60 px-6 py-10 text-center in-data-[density=compact]:py-8">
      {/* The text may quote what was typed (a search): a long unbroken query wraps instead of widening the page. */}
      <p className="max-w-prose text-base text-pretty wrap-anywhere text-muted-foreground in-data-[density=compact]:text-sm">
        {children}
      </p>
      {action}
    </div>
  )
}
