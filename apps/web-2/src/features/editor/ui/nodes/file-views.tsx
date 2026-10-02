import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { FileText } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

import { blockFileUrl, isRecord, numberAttr } from '../../model/document'
import { justify } from './align'

const width = (size: unknown) => (isRecord(size) ? (numberAttr(size['width']) ?? undefined) : undefined)
const height = (size: unknown) => (isRecord(size) ? (numberAttr(size['height']) ?? 540) : 540)

/** blockImage / blockPDF / blockVideo: the uploaded file, or a note in the editor when nothing was uploaded. */
export function FileView({ node, editor }: ReactNodeViewProps) {
  const url = blockFileUrl(node.attrs['blockObject'])
  if (!url)
    return (
      <NodeViewWrapper className="my-4">
        {editor.isEditable ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {m.editor_file_missing()}
          </p>
        ) : null}
      </NodeViewWrapper>
    )
  if (node.type.name === 'blockVideo')
    return (
      <NodeViewWrapper className="my-4">
        <video controls preload="metadata" src={url} className="w-full rounded-lg bg-muted">
          <track kind="captions" />
        </video>
      </NodeViewWrapper>
    )
  if (node.type.name === 'blockPDF')
    return (
      <NodeViewWrapper className="my-4 flex flex-col gap-2">
        <iframe
          src={url}
          title={m.editor_pdf_title()}
          sandbox="allow-same-origin"
          height={height(node.attrs['size'])}
          className="w-full rounded-lg border border-border"
        />
        <Link to={url} target="_blank" rel="noopener noreferrer">
          <FileText aria-hidden className="mr-1 inline size-4" />
          {m.editor_pdf_open()}
        </Link>
      </NodeViewWrapper>
    )
  return (
    <NodeViewWrapper className={`my-4 flex ${justify(node.attrs['alignment'])}`}>
      <img
        src={url}
        alt={m.editor_image_alt()}
        width={width(node.attrs['size'])}
        loading="lazy"
        className="h-auto max-w-full rounded-lg"
      />
    </NodeViewWrapper>
  )
}
