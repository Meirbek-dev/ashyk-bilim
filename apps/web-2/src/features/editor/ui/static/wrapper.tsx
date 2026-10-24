import type { HTMLAttributes } from 'react'
import { cn } from 'cn'

export type PartProps = HTMLAttributes<HTMLElement> & { as?: 'div' | 'span' }

/** Tiptap's NodeViewWrapper without the editor: the same element and white-space. */
export function StaticWrapper({ as: Tag = 'div', className, ...props }: PartProps) {
  return <Tag {...props} data-node-view-wrapper="" className={cn('whitespace-normal', className)} />
}
