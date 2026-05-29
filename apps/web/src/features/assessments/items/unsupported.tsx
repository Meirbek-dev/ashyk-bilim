import { createElement } from 'react'
import type { ReactNode } from 'react'

export function UnsupportedItemAuthor({ value }: { value: any }): ReactNode {
  return createElement(
    'pre',
    { className: 'bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs' },
    JSON.stringify(value, null, 2),
  )
}

export function UnsupportedItemAttempt({ item }: { item: any }): ReactNode {
  return createElement(
    'div',
    {
      className: 'text-muted-foreground rounded-md border border-dashed p-4 text-sm',
    },
    `Unsupported item: ${JSON.stringify(item)}`,
  )
}

export function UnsupportedItemReview({ answer }: { answer: any }): ReactNode {
  return createElement(
    'pre',
    { className: 'bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs' },
    JSON.stringify(answer, null, 2),
  )
}
