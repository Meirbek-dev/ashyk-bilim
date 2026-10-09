/**
 * v2 upload pipeline (ARCHITECTURE §6/§11, DECISIONS "Same-origin object
 * storage routing"): the API never proxies bytes. Every file goes
 *
 *   POST /uploads {purpose, mime, size_bytes}  → {id, key, put_url}
 *   PUT  put_url  (raw bytes, presigned, ~15 min, create-only: If-None-Match: *)
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

/**
 * The type the server's policy matches exactly. Browsers disagree per OS:
 * Chromium on Windows says `video/matroska` for .mkv, `video/avi` for .avi,
 * and some systems give an empty type - so a type outside this table falls
 * back to the one the extension names.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
}

const CANONICAL_TYPES = new Set(Object.values(MIME_BY_EXTENSION))

export function uploadMime(file: Blob): string {
  if (CANONICAL_TYPES.has(file.type)) return file.type
  const name = 'name' in file && typeof file.name === 'string' ? file.name : ''
  const dot = name.lastIndexOf('.')
  const fromExtension = dot === -1 ? undefined : MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()]
  return fromExtension ?? (file.type || 'application/octet-stream')
}

/** Video containers a browser can play (`block-video` also stores AVI/FLV, which no browser plays). */
const PLAYABLE_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime'])
export const VIDEO_UPLOAD_ACCEPT = '.mp4,.m4v,.webm,.mkv,.mov,video/mp4,video/webm,video/x-matroska,video/quicktime'
export const isPlayableVideoUpload = (file: File) => PLAYABLE_VIDEO_TYPES.has(uploadMime(file))

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
        mime: uploadMime(file),
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

async function putWithProgress(url: string, file: Blob, options: UploadFileOptions): Promise<void> {
  // Signed into the URL: must be exactly what `createUpload` declared.
  const contentType = uploadMime(file)

  // XMLHttpRequest is the only browser primitive with upload progress events.
  if (typeof XMLHttpRequest !== 'undefined' && options.onProgress) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url, true)
      xhr.setRequestHeader('Content-Type', contentType)
      // BUG-350: the presigned PUT is create-only (the header is signed).
      xhr.setRequestHeader('If-None-Match', '*')
      xhr.upload.addEventListener('progress', event => {
        const total = event.lengthComputable ? event.total : file.size
        options.onProgress?.({
          uploadedBytes: event.loaded,
          totalBytes: total,
          percentage: total > 0 ? Math.round((event.loaded / total) * 100) : 0,
        })
      })
      xhr.addEventListener('load', () => {
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
      })
      xhr.addEventListener('error', () =>
        reject(clientApiError('NETWORK_UNAVAILABLE', 'Upload to storage failed', { path: url })),
      )
      xhr.addEventListener('abort', () =>
        reject(clientApiError('REQUEST_ABORTED', 'Upload was aborted', { path: url })),
      )
      options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
      xhr.send(file)
    })
  }

  const response = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
    ...(options.signal ? { signal: options.signal } : {}),
  })
  if (!response.ok) {
    throw clientApiError('NETWORK_UNAVAILABLE', `Storage rejected the upload (${response.status})`, {
      path: url,
      status: response.status,
    })
  }
  options.onProgress?.({ uploadedBytes: file.size, totalBytes: file.size, percentage: 100 })
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
  const guard = typeof globalThis.addEventListener === 'function' ? globalThis : null
  if (guard) {
    inFlightUploads += 1
    if (inFlightUploads === 1) guard.addEventListener('beforeunload', confirmLeavingUpload)
  }
  try {
    const created = await createUpload(file, purpose)
    throwIfCancelled(options.signal)
    await putWithProgress(created.put_url, file, options)
    throwIfCancelled(options.signal)
    return await finalizeUpload(created.id)
  } finally {
    if (guard) {
      inFlightUploads -= 1
      if (inFlightUploads === 0) guard.removeEventListener('beforeunload', confirmLeavingUpload)
    }
  }
}

function throwIfCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw clientApiError('REQUEST_ABORTED', 'Upload was aborted', { path: 'uploads' })
}

/** A reload or tab close kills an in-flight PUT (a lecture video takes minutes): the browser asks first. */
let inFlightUploads = 0
function confirmLeavingUpload(event: BeforeUnloadEvent) {
  event.preventDefault()
}
