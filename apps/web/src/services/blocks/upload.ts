/**
 * v2 editor block files (AGENTS.md "Uploads never go through the API"):
 *
 *   uploadFile(file, 'block-<type>')   presigned PUT, progress from the XHR
 *   POST activities/{id}/blocks        claims the upload → {id, content: {file_key, …}}
 *
 * The editor keeps `{block_uuid, content}` in the tiptap JSON; `content.file_key`
 * is the storage key served at `/content/<key>` (`getContentUrl`). Migrated
 * legacy rows carry `file_id` + `file_format` instead.
 */
import { apiJson } from '@/lib/api-client'
import { Block } from '@/lib/api/generated/zod'
import { getContentUrl } from '@services/media/media'
import { uploadFile } from '@services/media/uploads'
import type { UploadProgress } from '@services/media/uploads'

export type BlockFileType = 'image' | 'pdf' | 'video'

export interface BlockFileContent {
  /** v2 storage key; absent on ETL-migrated rows. */
  file_key?: string
  file_id: string
  file_format: string
  file_name?: string
}

export interface BlockFileObject {
  block_uuid: string
  content: BlockFileContent
}

/** Public URL of a block file; legacy rows resolve `<file_id>.<file_format>`. */
export function getBlockFileUrl(content: BlockFileContent | null | undefined): string | null {
  if (!content) return null
  return getContentUrl(content.file_key ?? `${content.file_id}.${content.file_format}`)
}

export async function uploadBlockFile(
  file: File,
  activityId: string,
  blockType: BlockFileType,
  onProgress?: (progress: UploadProgress) => void,
): Promise<BlockFileObject> {
  const upload = await uploadFile(file, `block-${blockType}`, onProgress ? { onProgress } : {})
  const block = await apiJson(
    `activities/${encodeURIComponent(activityId)}/blocks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_type: blockType, upload_id: upload.id, file_name: file.name }),
    },
    (body: unknown) => Block.parse(body),
  )
  const dot = file.name.lastIndexOf('.')
  return {
    block_uuid: block.id,
    content: {
      file_id: upload.id,
      file_key: upload.key,
      file_format: dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase(),
      file_name: file.name,
    },
  }
}
