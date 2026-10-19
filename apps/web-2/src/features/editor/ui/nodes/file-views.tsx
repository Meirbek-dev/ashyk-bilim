import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { FileText } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'
import { PdfFrame } from '#/shared/components/pdf-frame'

import { blockFileUrl, isRecord, numberAttr } from '../../model/document'
import { justify } from './align'
import { FileUpload } from './file-upload'
import { ImageView } from './image-view'
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
        {/* No stored size (a document lesson, an old block): as tall as the window, not a 540 px letterbox. */}
        <PdfFrame
          src={url}
          title={m.editor_pdf_title()}
          height={height(node.attrs['size'])}
          tall={!isRecord(node.attrs['size'])}
          fallback={null}
        />
        {/* A button, not a bare link: on a phone (no PDF viewer in a page) it is the lesson's one way in. */}
        <Anchor
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', className: 'self-start no-underline' })}
        >
          <FileText aria-hidden data-icon="inline-start" />
          {m.editor_pdf_open()}
        </Anchor>
      </NodeViewWrapper>
    )
  return (
    <NodeViewWrapper className={`my-4 flex ${justify(node.attrs['alignment'])}`}>
      <ImageView src={url} width={width(node.attrs['size'])} editable={editor.isEditable} />
    </NodeViewWrapper>
  )
}
