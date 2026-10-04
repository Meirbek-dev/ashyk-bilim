import { useQueryClient } from '@tanstack/react-query'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { linkPreviewOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { Link } from '#/shared/components/link'
import { buttonVariants } from '#/shared/ui/button'

import { textAttr } from '../../model/document'
import { linkHref } from '../../model/link'
import { justify } from './align'
import { AttrForm } from './attr-form'

// A preview needs a web page: `example.com` is read as https (B-EDT-23).
const webUrl = (value: string) => {
  const href = linkHref(value)
  return href && /^https?:\/\//i.test(href) ? href : undefined
}

/** blockWebPreview: a link card (title, description, site) filled from the server's page preview. */
export function WebPreviewView({ node, editor, selected, updateAttributes }: ReactNodeViewProps) {
  const queryClient = useQueryClient()
  const url = textAttr(node.attrs['url'])
  const href = url && webUrl(url) === url ? url : null
  const apply = async ({ url: typed = '' }: Record<string, string>) => {
    const next = webUrl(typed) ?? typed
    // A 422 (a local or private address) goes under the field; any other failure keeps the link without a card.
    const preview = await queryClient
      .fetchQuery(linkPreviewOptions({ query: { url: next } }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.fieldErrors.length > 0) throw error
        return null
      })
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
              <RouterLink
                to={href}
                className={buttonVariants({ variant: 'outline' })}
                target="_blank"
                rel="noopener noreferrer"
              >
                {textAttr(node.attrs['buttonLabel']) ?? m.editor_preview_open()}
              </RouterLink>
            </div>
          ) : null}
        </div>
      ) : null}
      {editor.isEditable && (selected || !href) ? (
        <AttrForm
          fields={[{ name: 'url', label: m.editor_field_url(), check: value => webUrl(value) !== undefined }]}
          values={{ url: url ?? '' }}
          onApply={apply}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
