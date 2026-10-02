import { useQueryClient } from '@tanstack/react-query'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

import { safeUrl } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { linkPreviewOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { Link } from '#/shared/ui/link'

import { textAttr } from '../../model/document'
import { justify } from './align'
import { AttrForm } from './attr-form'

const isWeb = (value: string) => /^https?:\/\//i.test(safeUrl(value) ?? '')

/** blockWebPreview: a link card (title, description, site) filled from the server's page preview. */
export function WebPreviewView({ node, editor, selected, updateAttributes }: ReactNodeViewProps) {
  const queryClient = useQueryClient()
  const url = textAttr(node.attrs['url'])
  const href = url && isWeb(url) ? url : null
  const apply = async ({ url: next = '' }: Record<string, string>) => {
    const preview = await queryClient.fetchQuery(linkPreviewOptions({ query: { url: next } })).catch(() => null)
    updateAttributes({
      url: next,
      title: preview?.title ?? null,
      description: preview?.description ?? null,
      og_image: preview?.image_url ?? null,
      site_name: preview?.site_name ?? null,
      og_url: preview?.url ?? null,
    })
  }
  return (
    <NodeViewWrapper className={`my-4 flex flex-col gap-2 ${justify(node.attrs['alignment'])}`}>
      {href ? (
        <div className="flex max-w-xl flex-col gap-1 rounded-lg border border-border bg-card p-4 text-card-foreground">
          <p className="text-xs text-muted-foreground">{textAttr(node.attrs['site_name']) ?? new URL(href).hostname}</p>
          <Link to={href} target="_blank" rel="noopener noreferrer">
            {textAttr(node.attrs['title']) ?? href}
          </Link>
          {node.attrs['description'] ? (
            <p className="text-sm text-muted-foreground">{String(node.attrs['description'])}</p>
          ) : null}
          {node.attrs['showButton'] ? (
            <div className="pt-2">
              <Link to={href} variant="outline" target="_blank" rel="noopener noreferrer">
                {textAttr(node.attrs['buttonLabel']) ?? m.editor_preview_open()}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {editor.isEditable && (selected || !href) ? (
        <AttrForm
          fields={[{ name: 'url', label: m.editor_field_url(), check: isWeb }]}
          values={{ url: url ?? '' }}
          onApply={values => void apply(values)}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
