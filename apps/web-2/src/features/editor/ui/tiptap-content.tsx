import { NodeViewContent } from '@tiptap/react'

import type { PartProps } from './nodes/parts'

// NodeViewContent is generic over its tag: pinned to the two the views use.
export function TiptapContent({ as, ...props }: PartProps) {
  return as === 'span' ? <NodeViewContent<'span'> as="span" {...props} /> : <NodeViewContent {...props} />
}
