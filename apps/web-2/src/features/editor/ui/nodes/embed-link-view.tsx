import { use } from 'react'

import { Link } from '#/shared/components/link'

import { textAttr } from '../../model/document'
import { NodeParts, type ViewProps } from './parts'

/** embedBlock in a discussion post: its editor cannot author one, so an old post's embed is a link, never a frame. */
export function EmbedLinkView({ node }: ViewProps) {
  const { Wrapper } = use(NodeParts)
  const url = textAttr(node.attrs['url'])
  return (
    <Wrapper className="my-2">
      {url?.startsWith('https://') ? (
        <Link to={url} target="_blank" rel="noopener noreferrer">
          {url}
        </Link>
      ) : null}
    </Wrapper>
  )
}
