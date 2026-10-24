import { createContext, use, type ReactNode } from 'react'
import { cn } from 'cn'

import type { PartProps } from './wrapper'

/** The rendered child blocks of the node being drawn by the static viewer. */
export const NodeChildren = createContext<ReactNode>(null)

/** Tiptap's NodeViewContent without the editor: it holds the node's content DOM (same tag, white-space inherited). */
export function StaticContent({ as: Tag = 'div', className, ...props }: PartProps) {
  return (
    <Tag {...props} data-node-view-content="" className={cn('whitespace-pre-wrap', className)}>
      <Tag data-node-view-content-react="" className="whitespace-inherit">
        {use(NodeChildren)}
      </Tag>
    </Tag>
  )
}
