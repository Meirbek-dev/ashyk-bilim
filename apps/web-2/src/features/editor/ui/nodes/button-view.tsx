import { use } from 'react'
import { Link as RouterLink } from '@tanstack/react-router'

import { safeUrl } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'

import { linkHref } from '../../model/link'
import { justify, stringAttr } from './align'
import { NodeParts, type ViewProps } from './parts'

/** button: a link styled as a button; its label is the node's text, editable in place. */
export function ButtonView({ node, editor, selected, updateAttributes }: ViewProps) {
  const { Wrapper, Content, Authoring } = use(NodeParts)
  const link = stringAttr(node.attrs['link'])
  const href = safeUrl(link)
  const emoji = stringAttr(node.attrs['emoji'])
  const label = (
    <>
      {emoji ? <span aria-hidden>{emoji}</span> : null}
      <Content as="span" />
    </>
  )
  return (
    <Wrapper className="my-4 flex flex-col gap-2">
      <div className={`flex ${justify(node.attrs['alignment'])}`}>
        {href && !editor.isEditable ? (
          <RouterLink
            to={href}
            className={buttonVariants({ variant: 'outline' })}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label}
          </RouterLink>
        ) : (
          <span className="inline-flex h-control items-center gap-2 rounded-md border border-input px-4 text-sm font-medium">
            {label}
          </span>
        )}
      </div>
      {editor.isEditable && Authoring && (selected || !href) ? (
        <Authoring.AttrForm
          fields={[{ name: 'link', label: m.editor_field_link(), check: value => linkHref(value) !== undefined }]}
          values={{ link }}
          onApply={({ link: next = '' }) => updateAttributes({ link: linkHref(next) ?? next })}
        />
      ) : null}
    </Wrapper>
  )
}
