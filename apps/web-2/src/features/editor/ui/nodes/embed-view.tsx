import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

import { numberAttr, textAttr } from '../../model/document'
import { embedSandbox, embedSrc, embedTypeForUrl, isOwnSite, youTubeId } from '../../model/embed'
import { AttrForm } from './attr-form'

/**
 * embedBlock: one iframe for every provider (YouTube, Google Docs, Excalidraw, known services). The stored
 * width ('100%', '91%') and height (px) go to the iframe's own attributes; narrower embeds are centered.
 * Authoring: paste a URL, the provider is detected from it. Under a page embed (not YouTube) the page itself opens in a
 * new tab: a form that wants a Google sign-in cannot sign in inside a frame, and a page a service refuses to frame or
 * that is off the catalog would otherwise leave the learner with nothing (B-EDT-24).
 */
export function EmbedView({ node, editor, selected, updateAttributes }: ReactNodeViewProps) {
  const type = textAttr(node.attrs['type'])
  const url = textAttr(node.attrs['url'])
  const src = embedSrc(type, url)
  const page = url?.trim() ?? ''
  const external = /^https:\/\//i.test(page) && type !== 'youtube' && !youTubeId(page) ? page : null
  const form = editor.isEditable && (selected || !src) && (
    <AttrForm
      fields={[
        {
          name: 'url',
          label: m.editor_field_url(),
          check: value =>
            isOwnSite(value, document.baseURI)
              ? m.editor_embed_own_origin()
              : embedSrc(embedTypeForUrl(value), value) !== null,
        },
      ]}
      values={{ url: url ?? '' }}
      onApply={values => updateAttributes({ url: values['url'], type: embedTypeForUrl(values['url'] ?? '') })}
    />
  )
  return (
    <NodeViewWrapper className="my-4 flex flex-col items-center gap-2">
      {src ? (
        <iframe
          src={src}
          title={m.editor_embed_title()}
          width={textAttr(node.attrs['width']) ?? '100%'}
          height={numberAttr(node.attrs['height']) ?? 500}
          sandbox={embedSandbox(src)}
          allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className="max-w-full rounded-lg border border-border"
        />
      ) : url && (editor.isEditable || !external) ? (
        <p className="text-sm text-destructive">{m.editor_embed_unsafe()}</p>
      ) : null}
      {external ? (
        <Link to={external} target="_blank" rel="noopener noreferrer">
          {m.editor_embed_open()}
        </Link>
      ) : null}
      {form || null}
    </NodeViewWrapper>
  )
}
