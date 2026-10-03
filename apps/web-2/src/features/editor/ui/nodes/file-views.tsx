import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { FileText } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { PdfFrame } from '#/shared/components/pdf-frame'

import { blockFileUrl, isRecord, numberAttr } from '../../model/document'
import { justify } from './align'
import { FileUpload } from './file-upload'
import { VideoPlayer } from './video-player'

const width = (size: unknown) => (isRecord(size) ? (numberAttr(size['width']) ?? undefined) : undefined)
const height = (size: unknown) => (isRecord(size) ? (numberAttr(size['height']) ?? 540) : 540)

/** blockImage / blockPDF / blockVideo: the uploaded file from `/content/<key>`; in authoring, an upload while empty. */
export function FileView(props: ReactNodeViewProps) {
  const { node, editor } = props
  const url = blockFileUrl(node.attrs['blockObject'])
  if (!url) return editor.isEditable ? <FileUpload {...props} /> : <NodeViewWrapper />
  if (node.type.name === 'blockVideo')
    return (
      <NodeViewWrapper className="my-4" contentEditable={false}>
        <VideoPlayer src={url} />
      </NodeViewWrapper>
    )
  if (node.type.name === 'blockPDF')
    return (
      <NodeViewWrapper className="my-4 flex flex-col gap-2">
        <PdfFrame src={url} title={m.editor_pdf_title()} height={height(node.attrs['size'])} />
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
