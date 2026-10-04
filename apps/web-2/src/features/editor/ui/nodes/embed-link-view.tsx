import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

import { Link } from '#/shared/components/link'

import { textAttr } from '../../model/document'

/** embedBlock in a discussion post: its editor cannot author one, so an old post's embed is a link, never a frame. */
export function EmbedLinkView({ node }: ReactNodeViewProps) {
  const url = textAttr(node.attrs['url'])
  return (
    <NodeViewWrapper className="my-2">
      {url?.startsWith('https://') ? (
        <Link to={url} target="_blank" rel="noopener noreferrer">
          {url}
        </Link>
      ) : null}
    </NodeViewWrapper>
  )
}
