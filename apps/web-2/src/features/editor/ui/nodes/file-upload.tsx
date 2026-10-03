import { useMutation } from '@tanstack/react-query'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { use, useState } from 'react'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { FileInput } from '#/shared/ui/file-input'

import { FILE_BLOCKS, fileBlockObject, isFileBlock, type FileBlock } from '../../model/file-blocks'
import { createBlockOptions } from '../../queries'
import { ActivityContext, queuedFiles } from '../file-drop'

const LOOKS: Record<FileBlock, { label: () => string; hint: () => string }> = {
  blockImage: { label: m.editor_block_image, hint: m.editor_image_hint },
  blockPDF: { label: m.editor_block_pdf, hint: m.editor_pdf_hint },
  blockVideo: { label: m.editor_block_video, hint: m.editor_video_hint },
}

/**
 * An image, PDF or video block without its file (authoring): pick or drop one, or the file pasted / dropped onto
 * the editor uploads at once. Progress and errors stay in the block; the upload is claimed for the activity and
 * the block then stores its key.
 */
export function FileUpload({ node, updateAttributes }: ReactNodeViewProps) {
  const activityId = use(ActivityContext)
  const [queued] = useState(() => queuedFiles.get(node))
  const claim = useMutation(createBlockOptions(activityId ?? ''))
  const name = node.type.name
  if (!activityId || !isFileBlock(name))
    return (
      <NodeViewWrapper className="my-4">
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {m.editor_file_missing()}
        </p>
      </NodeViewWrapper>
    )
  const { purpose, blockType } = FILE_BLOCKS[name]
  return (
    <NodeViewWrapper className="my-4" contentEditable={false}>
      <FileInput
        label={LOOKS[name].label()}
        description={LOOKS[name].hint()}
        purpose={purpose}
        file={queued}
        disabled={claim.isPending}
        error={claim.error ? presentError(claim.error) : undefined}
        onUploaded={(upload, file) =>
          claim.mutate(
            {
              path: { activity_id: activityId },
              body: { block_type: blockType, upload_id: upload.id, file_name: file.name },
            },
            { onSuccess: block => updateAttributes({ blockObject: fileBlockObject(block.id, upload, file.name) }) },
          )
        }
      />
    </NodeViewWrapper>
  )
}
