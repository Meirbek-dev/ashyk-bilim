import { ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps, ReactNodeViewRendererOptions } from '@tiptap/react'
import type { FC } from 'react'

export type TypedNodeViewProps<TAttrs, TExtensionOptions = Record<string, unknown>> = Omit<
  NodeViewProps,
  'node' | 'extension'
> & {
  node: NodeViewProps['node'] & {
    attrs: TAttrs
  }
  extension: NodeViewProps['extension'] & {
    options: TExtensionOptions
  }
}

/**
 * Type-safe wrapper around ReactNodeViewRenderer that accepts components
 * typed with TypedNodeViewProps. Centralises the single unavoidable cast
 * so extension files stay clean.
 */
export function nodeView<T>(
  component: FC<TypedNodeViewProps<T>>,
  options?: Partial<ReactNodeViewRendererOptions>,
) {
  // TypedNodeViewProps only narrows NodeViewProps, so this is safe at runtime.
  return ReactNodeViewRenderer(component as FC<NodeViewProps>, options)
}
