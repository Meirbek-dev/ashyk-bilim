import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { ActivityDetail, FinalizedUpload } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { FileInput } from '#/shared/ui/file-input'
import { Anchor } from '#/shared/ui/link'

import { claimOptions, updateActivityOptions } from '../curriculum-queries'
import { fileContent, mediaBlock, mediaSource } from '../model/studio'

/**
 * An uploaded video or PDF: the current file, and a new one that replaces it. The upload is claimed for the
 * activity (`POST /activities/{id}/blocks`, else storage reaps it), then `content` points at it (`If-Match`).
 */
export function MediaFileSection({ courseId, activity }: { courseId: string; activity: ActivityDetail }) {
  const claim = useMutation(claimOptions())
  const update = useMutation(updateActivityOptions(useQueryClient(), courseId))
  const source = mediaSource(activity)
  const { blockType, purpose } = mediaBlock(activity.activity_type)
  const video = activity.activity_type === 'video'
  const point = (upload: FinalizedUpload, file: File) =>
    update.mutate(
      {
        path: { activity_id: activity.id },
        body: { content: fileContent(upload, file.name) },
        headers: { 'If-Match': activity.version },
      },
      { onSuccess: () => toast(m.studio_media_replaced()) },
    )
  const replace = (upload: FinalizedUpload, file: File) =>
    claim.mutate(
      {
        path: { activity_id: activity.id },
        body: { block_type: blockType, upload_id: upload.id, file_name: file.name },
      },
      { onSuccess: () => point(upload, file) },
    )
  const error = claim.error ?? update.error
  return (
    <section aria-label={m.studio_media_title()} className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.studio_media_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.studio_media_hint()}</p>
      </div>
      {source.kind === 'file' ? (
        <p className="wrap-anywhere">
          <Anchor href={`/content/${source.key}`} target="_blank" rel="noreferrer">
            {m.studio_media_current({ name: source.name })}
          </Anchor>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{m.studio_media_none()}</p>
      )}
      <FileInput
        label={video ? m.studio_video_file_field() : m.studio_pdf_file_field()}
        description={video ? m.studio_video_types() : m.studio_pdf_types()}
        purpose={purpose}
        disabled={claim.isPending || update.isPending}
        error={error ? presentError(error) : undefined}
        onUploaded={replace}
      />
    </section>
  )
}
