import type { ReactNode } from 'react'

import { ListState } from '#/shared/components/list-state'

type ConsistencyBlockProps = {
  id: string
  title: string
  /** What the table shows, in one sentence. */
  hint: string
  count: number
  /** One sentence when the table is empty. */
  empty: string
  /** The table. */
  children: ReactNode
}

/** One section of the consistency page: a heading, its rule in a sentence, the table or its empty state. */
export function ConsistencyBlock({ id, title, hint, count, empty, children }: ConsistencyBlockProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-xl font-semibold">
          {title}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{hint}</p>
      </div>
      <ListState
        pending={false}
        error={null}
        count={count}
        filtered={false}
        emptyText={empty}
        onRetry={() => undefined}
      >
        {children}
      </ListState>
    </section>
  )
}
