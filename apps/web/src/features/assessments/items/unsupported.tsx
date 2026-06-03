import { createElement } from 'react'
import type { ReactNode } from 'react'

export function UnsupportedItemAuthor({ value }: { value: unknown }): ReactNode {
  return createElement(
    'pre',
    { className: 'bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs' },
    JSON.stringify(value, null, 2),
  )
}

export function UnsupportedItemAttempt({ item }: { item: unknown }): ReactNode {
  return createElement(
    'div',
    {
      className: 'text-muted-foreground rounded-md border border-dashed p-4 text-sm',
    },
    `Unsupported item: ${JSON.stringify(item)}`,
  )
}

export function UnsupportedItemReview({ answer }: { answer: unknown }): ReactNode {
  return createElement(
    'pre',
    { className: 'bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs' },
    JSON.stringify(answer, null, 2),
  )
}
