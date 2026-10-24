import { use } from 'react'
import { Info, TriangleAlert } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { NodeParts, type ViewProps } from './parts'

const looks = {
  calloutInfo: { Icon: Info, label: m.editor_callout_info, callout: 'info', ink: 'text-info' },
  calloutWarning: { Icon: TriangleAlert, label: m.editor_callout_warning, callout: 'warning', ink: 'text-warning' },
}

/** calloutInfo / calloutWarning: the prose callout (`data-callout`) with its icon; the text inside stays editable. */
export function CalloutView({ node }: ViewProps) {
  const { Wrapper, Content } = use(NodeParts)
  const look = node.type.name === 'calloutWarning' ? looks.calloutWarning : looks.calloutInfo
  return (
    <Wrapper role="note" aria-label={look.label()} data-callout={look.callout} className="flex gap-3">
      <look.Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${look.ink}`} />
      <Content className="min-w-0 flex-1" />
    </Wrapper>
  )
}
