import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { m } from '#/paraglide/messages'
import { deleteBlockMutation, listBlocksOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { ActivityDetail, Block, FinalizedUpload } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { FileInput } from '#/shared/components/file-input'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { activityOptions, claimOptions, updateActivityOptions } from '../curriculum-queries'
import { fileContent, mediaBlock, mediaSource, replacedMediaBlockIds } from '../model/studio'

/**
 * An uploaded video or PDF: the current file, and a new one that replaces it. The upload is claimed for the
 * activity (`POST /activities/{id}/blocks`, else storage reaps it), then `content` points at it (`If-Match`).
 */
export function MediaFileSection({ courseId, activity }: { courseId: string; activity: ActivityDetail }) {
  const queryClient = useQueryClient()
  const claim = useMutation(claimOptions())
  const update = useMutation(updateActivityOptions(queryClient, courseId))
  const remove = useMutation(deleteBlockMutation())
  const claimed = useRef<Block | null>(null)
  const source = mediaSource(activity)
  const { blockType, purpose } = mediaBlock(activity.activity_type)
  const video = activity.activity_type === 'video'
  const point = (upload: FinalizedUpload, file: File) =>
    update.mutateAsync(
      {
        path: { activity_id: activity.id },
        body: { content: fileContent(upload, file.name) },
        headers: {
          'If-Match': queryClient.getQueryData(activityOptions(activity.id).queryKey)?.version ?? activity.version,
        },
      },
      {
        onSuccess: () =>
          toast.add({ title: source.kind === 'file' ? m.studio_media_replaced() : m.studio_media_uploaded() }),
      },
    )
  const replace = async (upload: FinalizedUpload, file: File) => {
    const oldBlocks = await queryClient.query({
      ...listBlocksOptions({ path: { activity_id: activity.id } }),
      staleTime: 0,
    })
    if (claimed.current?.content.upload_id !== upload.id) {
      claimed.current = await claim.mutateAsync({
        path: { activity_id: activity.id },
        body: { block_type: blockType, upload_id: upload.id, file_name: file.name },
        headers: { 'Idempotency-Key': upload.id },
      })
    }
    await point(upload, file)
    await Promise.all(
      replacedMediaBlockIds(oldBlocks, blockType, claimed.current.id).map(blockId =>
        remove.mutateAsync({ path: { block_id: blockId } }),
      ),
    )
  }
  const error = claim.error ?? update.error ?? remove.error
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
