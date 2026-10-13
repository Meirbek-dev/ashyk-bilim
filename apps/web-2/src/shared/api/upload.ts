import type { CreatedUpload, FinalizedUpload, UploadPurpose } from './gen/types.gen'
import { abortMultipartUpload, completeMultipartUpload, createUpload, finalizeUpload } from './gen/sdk.gen'
import { ApiError } from './errors'

// Spec 7.3: the one way to upload a file. create (policy check, presigned PUT) -> PUT the bytes straight to storage
// with progress -> finalize (the API verifies the object). The returned id is what a resource then claims
// (`thumbnail_upload_id`...).

const MB = 1024 * 1024
const IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
// The server also stores AVI and FLV, which no browser plays: a lesson made of one shows learners nothing.
const VIDEOS = ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime']

/**
 * The type the server's policy matches exactly. Browsers disagree per OS: Chromium on Windows says
 * `video/matroska` for .mkv and `video/avi` for .avi, and a file without a registered type has none, so a type
 * outside this table falls back to the one the extension names.
 */
const TYPE_BY_EXTENSION: Record<string, string> = {
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
const KNOWN_TYPES = new Set(Object.values(TYPE_BY_EXTENSION))

/** The type a file is declared (and stored) with: see `TYPE_BY_EXTENSION`. */
export function uploadType(file: { name?: string; type: string }): string {
  if (KNOWN_TYPES.has(file.type)) return file.type
  const extension = file.name?.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  return TYPE_BY_EXTENSION[extension] ?? (file.type || 'application/octet-stream')
}

export type { UploadPurpose }

/**
 * The caps of `POST /uploads` per purpose (the server's purpose policy, crates/domain/src/files/uploads.rs; the
 * contract has the purpose enum, not the limits): this pre-check only saves a doomed upload, the server still
 * decides. An empty `mimes` list accepts any type.
 */
const uploadPolicy: Record<UploadPurpose, { maxBytes: number; mimes: readonly string[] }> = {
  avatar: { maxBytes: 5 * MB, mimes: IMAGES },
  'course-thumbnail': { maxBytes: 10 * MB, mimes: IMAGES },
  'block-image': { maxBytes: 10 * MB, mimes: IMAGES },
  'block-pdf': { maxBytes: 50 * MB, mimes: ['application/pdf'] },
  'block-video': { maxBytes: 2048 * MB, mimes: VIDEOS },
  'file-submission': { maxBytes: 100 * MB, mimes: [] },
  'platform-logo': { maxBytes: 10 * MB, mimes: IMAGES },
  'platform-thumbnail': { maxBytes: 10 * MB, mimes: IMAGES },
  'collection-cover': { maxBytes: 10 * MB, mimes: IMAGES },
  'discussion-image': { maxBytes: 5 * MB, mimes: IMAGES },
}

export type UploadProblem =
  | { kind: 'empty' }
  | { kind: 'too-large'; maxBytes: number }
  | { kind: 'wrong-type'; mimes: readonly string[] }

/**
 * Narrower rules of the resource the file is for (a file-submission task's types and size): an empty or absent
 * `mimes` keeps the purpose's list, `maxBytes` only lowers the purpose's cap.
 */
export type UploadLimits = { mimes?: readonly string[]; maxBytes?: number | null }

const policyOf = (purpose: UploadPurpose, limits: UploadLimits) => {
  const policy = uploadPolicy[purpose]
  return {
    maxBytes: Math.min(policy.maxBytes, limits.maxBytes ?? Infinity),
    mimes: limits.mimes?.length ? limits.mimes : policy.mimes,
  }
}

/** Why this file cannot be uploaded for this purpose, or null. Show it before any request (DESIGN 10 tone). */
export function checkUpload(
  file: { name?: string; size: number; type: string },
  purpose: UploadPurpose,
  limits: UploadLimits = {},
): UploadProblem | null {
  const { maxBytes, mimes } = policyOf(purpose, limits)
  // The server refuses an empty upload with a bare "validation failed".
  if (file.size === 0) return { kind: 'empty' }
  if (file.size > maxBytes) return { kind: 'too-large', maxBytes }
  if (mimes.length > 0 && !mimes.includes(uploadType(file))) return { kind: 'wrong-type', mimes }
  return null
}

/** The `accept` attribute of a file picker for this purpose ("" = any type). */
export const uploadAccept = (purpose: UploadPurpose, limits: UploadLimits = {}): string => {
  const mimes = policyOf(purpose, limits).mimes
  // The extensions too: a picker filters by the OS's type of a file, which may differ (`video/matroska`).
  const extensions = Object.entries(TYPE_BY_EXTENSION).flatMap(([extension, type]) =>
    mimes.includes(type) ? [`.${extension}`] : [],
  )
  return [...extensions, ...mimes].join(',')
}

/** The image of a paste (a screenshot, a copied picture), or null when the clipboard holds none. */
export function clipboardImage(clipboard: DataTransfer | null): File | null {
  for (const item of clipboard?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

type UploadOptions = {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  /** A slot whose bytes are already stored (`onStored`): only finalize it (pending slots stay finalizable 12 h). */
  resume?: UploadResume | undefined
  /** The bytes are in storage under this slot: a failed finalize (a session that ended meanwhile) can resume it. */
  onStored?: (slot: UploadResume) => void
}

/** In-memory retry state: completed parts need only assembly and finalize after signing in. */
export type UploadResume = { id: string; etags?: string[] }

/** PUT with upload progress: fetch has none on HTTP/1.1, so this is the one XMLHttpRequest of the app. */
function put(url: string, file: Blob, { onProgress, signal }: UploadOptions, multipart = false): Promise<string> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    // Signed into the URL: exactly the declared type.
    request.setRequestHeader('Content-Type', uploadType(file))
    // The presigned URL writes the object once; a replay answers 412 instead of overwriting.
    if (!multipart) request.setRequestHeader('If-None-Match', '*')
    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    })
    request.addEventListener('load', () =>
      request.status >= 200 && request.status < 300
        ? resolve(multipart ? (request.getResponseHeader('ETag') ?? '') : '')
        : reject(
            new ApiError({
              status: request.status,
              code: request.status === 413 ? 'payload-too-large' : 'service-unavailable',
              fieldErrors: [],
              requestId: null,
              retryAfter: null,
            }),
          ),
    )
    request.addEventListener('error', () => reject(new Error('storage PUT failed')))
    request.addEventListener('abort', () => reject(new DOMException('upload aborted', 'AbortError')))
    const abort = () => request.abort()
    signal?.addEventListener('abort', abort, { once: true })
    request.addEventListener('loadend', () => signal?.removeEventListener('abort', abort), { once: true })
    request.send(file)
  })
}

async function putMultipart(created: CreatedUpload, file: File, options: UploadOptions): Promise<string[]> {
  const multipart = created.multipart
  if (!multipart) return []
  try {
    const etags: string[] = []
    let reported = 0
    for (const [index, url] of multipart.part_urls.entries()) {
      const start = index * multipart.part_size_bytes
      const part = file.slice(start, start + multipart.part_size_bytes, uploadType(file))
      let etag = ''
      for (let attempt = 0; ; attempt += 1) {
        options.signal?.throwIfAborted()
        try {
          etag = await put(
            storageUrl(url),
            part,
            {
              ...options,
              onProgress: fraction => {
                reported = Math.max(reported, (start + fraction * part.size) / file.size)
                options.onProgress?.(reported)
              },
            },
            true,
          )
          break
        } catch (error) {
          options.signal?.throwIfAborted()
          if (attempt >= 2 || (error instanceof ApiError && error.status > 0 && error.status < 500)) throw error
        }
      }
      if (!etag) throw new Error('storage PUT returned no ETag')
      etags.push(etag)
    }
    return etags
  } catch (error) {
    // Best effort; the server reaps parts if this request cannot reach it.
    await abortMultipartUpload({ path: { upload_id: created.id }, throwOnError: true }).catch(() => undefined)
    throw error
  }
}

/**
 * A bucket URL as a same-origin path: storage sits behind our origin (nginx; the dev server's and the local stand's
 * proxies, which presign for `localhost:9002`), and CSP allows `connect-src 'self'` only.
 */
const storageUrl = (url: string): string => {
  const target = new URL(url)
  return /^\/ab-(public|private)\//.test(target.pathname) ? `${target.pathname}${target.search}` : url
}

/** Uploads a file checked with `checkUpload`; resolves with the finalized upload whose id a resource claims. */
export async function upload(
  file: File,
  purpose: UploadPurpose,
  options: UploadOptions = {},
): Promise<FinalizedUpload> {
  options.signal?.throwIfAborted()
  let slot = options.resume
  if (!slot) {
    const { data: created } = await createUpload({
      body: {
        purpose,
        mime: uploadType(file),
        size_bytes: file.size,
        ...(purpose === 'block-video' && file.size > 32 * MB ? { multipart: true } : {}),
      },
      signal: options.signal,
      throwOnError: true,
    })
    if (created.multipart) slot = { id: created.id, etags: await putMultipart(created, file, options) }
    else {
      await put(storageUrl(created.put_url), file, options)
      slot = { id: created.id }
    }
    options.onStored?.(slot)
  }
  options.signal?.throwIfAborted()
  if (slot.etags)
    await completeMultipartUpload({
      path: { upload_id: slot.id },
      body: { etags: slot.etags },
      signal: options.signal,
      throwOnError: true,
    })
  // The slot id is the retry token: a repeated finalize replays the first answer instead of a 409.
  const { data } = await finalizeUpload({
    path: { upload_id: slot.id },
    headers: { 'Idempotency-Key': slot.id },
    signal: options.signal,
    throwOnError: true,
  })
  return data
}
