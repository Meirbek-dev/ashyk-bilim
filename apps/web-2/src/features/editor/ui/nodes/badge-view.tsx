import { use } from 'react'
import { NodeParts, type ViewProps } from './parts'

/** badge: emoji + short text on a neutral chip. The stored `color` is kept but not painted (DESIGN 1.3). */
export function BadgeView({ node }: ViewProps) {
  const { Wrapper, Content } = use(NodeParts)
  const emoji = typeof node.attrs['emoji'] === 'string' ? node.attrs['emoji'] : ''
  return (
    <Wrapper className="my-3 flex w-fit max-w-full items-start gap-2 rounded-sm border border-border bg-secondary px-2 py-1 text-sm text-secondary-foreground">
      {emoji ? <span aria-hidden>{emoji}</span> : null}
      <Content className="min-w-0 [&_p]:m-0" />
    </Wrapper>
  )
}
