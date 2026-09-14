/**
 * v2 upload pipeline (ARCHITECTURE §6/§11, DECISIONS "Same-origin object
 * storage routing"): the API never proxies bytes. Every file goes
 *
 *   POST /uploads {purpose, mime, size_bytes}  → {id, key, put_url}
 *   PUT  put_url  (raw bytes, presigned, ~15 min)
 *   POST /uploads/{id}/finalize                 → {id, key, size_bytes}
 *
 * and the finalized upload `id` is then attached to its owner (profile
 * avatar, course thumbnail, block, file-submission draft, …).
 */
import { apiJson } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import { CreatedUpload, FinalizedUpload } from '@/lib/api/generated/zod'
import type {
  CreatedUpload as CreatedUploadType,
  FinalizedUpload as FinalizedUploadType,
} from '@/lib/api/generated/zod'

export type UploadPurpose =
  | 'avatar'
  | 'course-thumbnail'
  | 'platform-logo'
  | 'platform-thumbnail'
  | 'block-image'
  | 'block-pdf'
  | 'block-video'
  | 'file-submission'

const MB = 1024 * 1024

/** The server's upload policies (`files/uploads.rs::policy`) — validate before `POST /uploads` 422s. */
export const UPLOAD_MAX_BYTES: Record<UploadPurpose, number> = {
  avatar: 5 * MB,
  'course-thumbnail': 10 * MB,
  'platform-logo': 10 * MB,
  'platform-thumbnail': 10 * MB,
  'block-image': 10 * MB,
  'block-pdf': 50 * MB,
  'block-video': 500 * MB,
  'file-submission': 100 * MB,
}

export const uploadMaxMb = (purpose: UploadPurpose) => UPLOAD_MAX_BYTES[purpose] / MB

export interface UploadProgress {
  uploadedBytes: number
  totalBytes: number
  percentage: number
}

export interface UploadFileOptions {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

export async function createUpload(file: Blob, purpose: UploadPurpose): Promise<CreatedUploadType> {
  return apiJson(
    'uploads',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose,
        mime: file.type || 'application/octet-stream',
        size_bytes: file.size,
      }),
    },
    data => CreatedUpload.parse(data),
  )
}

export async function finalizeUpload(uploadId: string): Promise<FinalizedUploadType> {
  return apiJson(`uploads/${encodeURIComponent(uploadId)}/finalize`, { method: 'POST' }, data =>
    FinalizedUpload.parse(data),
  )
}

/** Presigned download for a private upload (302 → short-lived URL). */
export function getUploadDownloadPath(uploadId: string): string {
  return `uploads/${encodeURIComponent(uploadId)}/download`
}

function putWithProgress(url: string, file: Blob, options: UploadFileOptions): Promise<void> {
  const contentType = file.type || 'application/octet-stream'

  // XMLHttpRequest is the only browser primitive with upload progress events.
  if (typeof XMLHttpRequest !== 'undefined' && options.onProgress) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url, true)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.upload.onprogress = event => {
        const total = event.lengthComputable ? event.total : file.size
        options.onProgress?.({
          uploadedBytes: event.loaded,
          totalBytes: total,
          percentage: total > 0 ? Math.round((event.loaded / total) * 100) : 0,
        })
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(
            clientApiError('NETWORK_UNAVAILABLE', `Storage rejected the upload (${xhr.status})`, {
              path: url,
              status: xhr.status,
            }),
          )
        }
      }
      xhr.onerror = () => reject(clientApiError('NETWORK_UNAVAILABLE', 'Upload to storage failed', { path: url }))
      xhr.onabort = () => reject(clientApiError('REQUEST_ABORTED', 'Upload was aborted', { path: url }))
      options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
      xhr.send(file)
    })
  }

  return fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
    ...(options.signal ? { signal: options.signal } : {}),
  }).then(response => {
    if (!response.ok) {
      throw clientApiError('NETWORK_UNAVAILABLE', `Storage rejected the upload (${response.status})`, {
        path: url,
        status: response.status,
      })
    }
    options.onProgress?.({ uploadedBytes: file.size, totalBytes: file.size, percentage: 100 })
  })
}

/**
 * Upload one file end to end and return the finalized upload (its `id` is
 * what the owning resource claims; `key` is the storage key for public
 * purposes, servable via `getContentUrl`).
 */
export async function uploadFile(
  file: File | Blob,
  purpose: UploadPurpose,
  options: UploadFileOptions = {},
): Promise<FinalizedUploadType> {
  const created = await createUpload(file, purpose)
  await putWithProgress(created.put_url, file, options)
  return finalizeUpload(created.id)
}
