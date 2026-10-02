import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Info, TriangleAlert } from 'lucide-react'

import { m } from '#/paraglide/messages'

const looks = {
  calloutInfo: { Icon: Info, label: m.editor_callout_info, box: 'border-info/30 bg-info/10', ink: 'text-info' },
  calloutWarning: {
    Icon: TriangleAlert,
    label: m.editor_callout_warning,
    box: 'border-warning/30 bg-warning/10',
    ink: 'text-warning',
  },
}

/** calloutInfo / calloutWarning: a tinted note with its icon; the text inside stays editable. */
export function CalloutView({ node }: ReactNodeViewProps) {
  const look = node.type.name === 'calloutWarning' ? looks.calloutWarning : looks.calloutInfo
  return (
    <NodeViewWrapper
      role="note"
      aria-label={look.label()}
      className={`my-4 flex gap-3 rounded-lg border p-4 ${look.box}`}
    >
      <look.Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${look.ink}`} />
      <NodeViewContent className="min-w-0 flex-1" />
    </NodeViewWrapper>
  )
}
