import { apiJson } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import { Block } from '@/lib/api/generated/zod'
import { createActivity, updateActivity } from '@services/courses/activities'
import { uploadFile } from '@services/media/uploads'
import type { UploadPurpose } from '@services/media/uploads'

export interface UploadProgress {
  percentage: number
}

const FILE_ACTIVITY_KINDS: Record<
  string,
  { purpose: UploadPurpose; blockType: string; activity_type: string; activity_sub_type: string }
> = {
  video: {
    purpose: 'block-video',
    blockType: 'video',
    activity_type: 'TYPE_VIDEO',
    activity_sub_type: 'SUBTYPE_VIDEO_HOSTED',
  },
  documentpdf: {
    purpose: 'block-pdf',
    blockType: 'pdf',
    activity_type: 'TYPE_DOCUMENT',
    activity_sub_type: 'SUBTYPE_DOCUMENT_PDF',
  },
}

/**
 * v2 file activity (AGENTS.md "Uploads never go through the API"):
 *
 *   uploadFile()                      presigned PUT, progress from the XHR
 *   POST chapters/{id}/activities     (+ PATCH details/content via createActivity)
 *   POST activities/{id}/blocks       claims the upload so the reaper keeps it
 *
 * `content.filename` carries the storage key: `Video.tsx` / `DocumentPdf.tsx`
 * resolve it with `getContentUrl(key)`, the same way migrated rows work.
 */
export async function createFileActivity(
  file: File,
  type: string,
  data: AppPayload,
  chapterId: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
) {
  const kind = FILE_ACTIVITY_KINDS[type]
  if (!kind) {
    throw clientApiError('INVALID_CLIENT_REQUEST', `Unsupported file activity type: ${type}`, {
      details: { type },
      path: 'activities',
    })
  }

  const upload = await uploadFile(file, kind.purpose, {
    onProgress: progress => onProgress?.({ percentage: progress.percentage }),
    ...(signal ? { signal } : {}),
  })

  const activity = await createActivity(
    {
      name: data.name || file.name,
      activity_type: kind.activity_type,
      activity_sub_type: kind.activity_sub_type,
      content: { filename: upload.key, upload_id: upload.id, file_name: file.name },
      ...(data.details ? { details: data.details } : {}),
    },
    chapterId,
  )

  await apiJson(
    `activities/${activity.activity_uuid}/blocks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_type: kind.blockType, upload_id: upload.id, file_name: file.name }),
    },
    (body: unknown) => Block.parse(body),
  )

  return activity
}

/**
 * Swap the file of an existing video / PDF activity: upload, claim the upload
 * as a block, point `content` at the new key (optimistic lock on `version`),
 * then drop the blocks of the replaced file.
 *
 * BUG-B9: the claim comes first so `content` never names an upload the reaper
 * may collect, and the old block is deleted - it kept every replaced lecture
 * in storage forever.
 */
export async function replaceActivityFile(
  activity: { activity_uuid: string; version?: unknown },
  file: File,
  type: 'video' | 'documentpdf',
  onProgress?: (progress: UploadProgress) => void,
) {
  const kind = FILE_ACTIVITY_KINDS[type]!
  const id = activity.activity_uuid
  const upload = await uploadFile(file, kind.purpose, {
    onProgress: progress => onProgress?.({ percentage: progress.percentage }),
  })
  const block = await apiJson(
    `activities/${id}/blocks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_type: kind.blockType, upload_id: upload.id, file_name: file.name }),
    },
    (body: unknown) => Block.parse(body),
  )
  const content = { filename: upload.key, upload_id: upload.id, file_name: file.name }
  let updated
  try {
    updated = await updateActivity({ content, version: activity.version }, id)
  } catch (error) {
    // Not shown anywhere: release the new file instead of keeping it.
    await deleteBlock(block.id)
    throw error
  }
  const blocks = await apiJson(`activities/${id}/blocks`, {}, (body: unknown) => Block.array().parse(body)).catch(
    () => [],
  )
  await Promise.all(blocks.filter(old => old.id !== block.id).map(old => deleteBlock(old.id)))
  return { ...updated, content }
}

/** Best effort: a block left behind only keeps its file in storage. */
const deleteBlock = (blockId: string) =>
  apiJson(`blocks/${blockId}`, { method: 'DELETE' }).then(
    () => undefined,
    () => undefined,
  )
