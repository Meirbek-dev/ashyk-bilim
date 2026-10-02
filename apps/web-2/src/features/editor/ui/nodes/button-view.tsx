import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { safeUrl } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

import { justify, stringAttr } from './align'
import { AttrForm } from './attr-form'

/** button: a link styled as a button; its label is the node's text, editable in place. */
export function ButtonView({ node, editor, selected, updateAttributes }: ReactNodeViewProps) {
  const link = stringAttr(node.attrs['link'])
  const href = safeUrl(link)
  const emoji = stringAttr(node.attrs['emoji'])
  const label = (
    <>
      {emoji ? <span aria-hidden>{emoji}</span> : null}
      <NodeViewContent<'span'> as="span" />
    </>
  )
  return (
    <NodeViewWrapper className="my-4 flex flex-col gap-2">
      <div className={`flex ${justify(node.attrs['alignment'])}`}>
        {href && !editor.isEditable ? (
          <Link to={href} variant="outline" target="_blank" rel="noopener noreferrer">
            {label}
          </Link>
        ) : (
          <span className="inline-flex h-control items-center gap-2 rounded-md border border-input px-4 text-sm font-medium">
            {label}
          </span>
        )}
      </div>
      {editor.isEditable && (selected || !href) ? (
        <AttrForm
          fields={[{ name: 'link', label: m.editor_field_link(), check: value => safeUrl(value) !== undefined }]}
          values={{ link }}
          onApply={values => updateAttributes(values)}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
