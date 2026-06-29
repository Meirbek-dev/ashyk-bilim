import { apiFetch, apiJson, errorHandling, getResponseMetadata } from '@/lib/api-client'
import type { CustomResponseTyping } from '@/lib/api-client'
import { clientApiError } from '@/lib/api/assertSuccess'
import { getAPIUrl } from '@services/config/config'

export type FileSubmissionAttemptStatus = 'DRAFT' | 'SUBMITTED' | 'GRADED' | 'PUBLISHED' | 'RETURNED'

export interface FileSubmissionAttemptFile {
  attempt_file_uuid: string
  upload_uuid: string
  filename: string
  content_type: string
  size_bytes?: number | null
  sha256?: string | null
  storage_key?: string | null
  scan_status: 'PENDING' | 'CLEAN' | 'FLAGGED' | 'ERROR'
  position: number
  created_at: string
}

export interface FileSubmissionAttempt {
  attempt_uuid: string
  status: FileSubmissionAttemptStatus
  attempt_number: number
  files: FileSubmissionAttemptFile[]
  is_late: boolean
  late_penalty_pct: number
  final_score?: number | null
  feedback: { feedback?: string; rubric?: Record<string, unknown> }
  version: number
  started_at?: string | null
  submitted_at?: string | null
  graded_at?: string | null
  created_at: string
  updated_at: string
  user?: {
    id: number
    username: string
    first_name?: string | null
    last_name?: string | null
    email: string
  } | null
}

export interface FileSubmissionActivity {
  id: number
  file_submission_uuid: string
  activity_id: number
  activity_uuid: string
  course_id?: number | null
  course_uuid?: string | null
  chapter_id: number
  title: string
  instructions: string
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  published: boolean
  allowed_mime_types: string[]
  max_files: number
  max_file_size_mb?: number | null
  due_at?: string | null
  allow_late: boolean
  max_attempts?: number | null
  grade_release_mode: 'IMMEDIATE' | 'BATCH'
  rubric: Record<string, unknown>
  settings: Record<string, unknown>
  current_attempt?: FileSubmissionAttempt | null
  attempts: FileSubmissionAttempt[]
  created_at: string
  updated_at: string
}

export interface FileSubmissionCreatePayload {
  title: string
  instructions: string
  course_id: number
  chapter_id: number
  allowed_mime_types?: string[]
  max_files?: number
  max_file_size_mb?: number | null
  due_at?: string | null
  allow_late?: boolean
  max_attempts?: number | null
  grade_release_mode?: 'IMMEDIATE' | 'BATCH'
}

export type FileSubmissionUpdatePayload = Partial<Omit<FileSubmissionCreatePayload, 'course_id' | 'chapter_id'>>

export interface FileSubmissionReviewQueue {
  items: FileSubmissionAttempt[]
  total: number
  page: number
  page_size: number
}

export async function getFileSubmissionByActivity(activityUuid: string): Promise<FileSubmissionActivity> {
  const response = await apiFetch(`file-submissions/activity/${activityUuid}`, {
    baseUrl: getAPIUrl(),
    timeoutMs: 10_000,
  })
  return await errorHandling(response)
}

export async function createFileSubmissionActivity(
  payload: FileSubmissionCreatePayload,
): Promise<CustomResponseTyping> {
  const response = await apiFetch('file-submissions', {
    method: 'POST',
    baseUrl: getAPIUrl(),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      allowed_mime_types: payload.allowed_mime_types ?? [],
      max_files: payload.max_files ?? 1,
      max_file_size_mb: payload.max_file_size_mb ?? null,
      due_at: payload.due_at ?? null,
      allow_late: payload.allow_late ?? true,
      max_attempts: payload.max_attempts ?? null,
      grade_release_mode: payload.grade_release_mode ?? 'IMMEDIATE',
    }),
  })
  const metadata = await getResponseMetadata(response)
  return metadata
}

export async function updateFileSubmissionActivity(
  fileSubmissionUuid: string,
  payload: FileSubmissionUpdatePayload,
): Promise<FileSubmissionActivity> {
  return apiJson<FileSubmissionActivity>(`file-submissions/${fileSubmissionUuid}`, {
    method: 'PATCH',
    baseUrl: getAPIUrl(),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function publishFileSubmissionActivity(fileSubmissionUuid: string): Promise<FileSubmissionActivity> {
  return apiJson<FileSubmissionActivity>(`file-submissions/${fileSubmissionUuid}/publish`, {
    method: 'POST',
    baseUrl: getAPIUrl(),
  })
}

export async function startFileSubmissionDraft(fileSubmissionUuid: string): Promise<FileSubmissionAttempt> {
  return apiJson<FileSubmissionAttempt>(`file-submissions/${fileSubmissionUuid}/draft`, {
    method: 'POST',
  })
}

export async function saveFileSubmissionDraft(
  fileSubmissionUuid: string,
  files: { upload_uuid: string; display_name?: string }[],
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  return apiJson<FileSubmissionAttempt>(`file-submissions/${fileSubmissionUuid}/draft`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(version ? { 'If-Match': String(version) } : {}),
    },
    body: JSON.stringify({ files }),
  })
}

export async function submitFileSubmission(
  fileSubmissionUuid: string,
  files: { upload_uuid: string; display_name?: string }[],
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  return apiJson<FileSubmissionAttempt>(`file-submissions/${fileSubmissionUuid}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(version ? { 'If-Match': String(version) } : {}),
    },
    body: JSON.stringify({ files }),
  })
}

export async function uploadSubmissionFile(file: File): Promise<{ upload_uuid: string; filename: string }> {
  return uploadSubmissionFileWithProgress(file)
}

/**
 * Upload a file with optional per-byte progress callback.
 * Uses XMLHttpRequest for the PUT step so the `onprogress` event fires.
 */
export async function uploadSubmissionFileWithProgress(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ upload_uuid: string; filename: string }> {
  const created = await apiJson<{
    upload_uuid: string
    put_url: string
  }>('uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      size: file.size,
    }),
  })

  // Use XHR for progress events on the large-binary PUT step
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', created.put_url)
    xhr.withCredentials = true
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)
    if (onProgress) {
      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable) onProgress(event.loaded, event.total)
      })
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(clientApiError('NETWORK_UNAVAILABLE', `Upload failed: ${xhr.statusText || xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(clientApiError('NETWORK_UNAVAILABLE', 'Upload network error')))
    xhr.addEventListener('abort', () => reject(clientApiError('REQUEST_ABORTED', 'Upload aborted')))
    xhr.send(file)
  })

  const digest = await sha256(file)
  const finalized = await apiJson<{ upload_uuid: string }>(`uploads/${created.upload_uuid}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha256: digest, content_type: file.type }),
  })
  return { upload_uuid: finalized.upload_uuid, filename: file.name }
}

export async function getFileSubmissionReviewQueue(fileSubmissionUuid: string): Promise<FileSubmissionReviewQueue> {
  return apiJson<FileSubmissionReviewQueue>(`file-submissions/${fileSubmissionUuid}/submissions`)
}

export async function getFileSubmissionFileUrl(attemptFileUuid: string): Promise<{
  attempt_file_uuid: string
  upload_uuid: string
  get_url: string
  expires_at: string
}> {
  return apiJson(`file-submissions/files/${attemptFileUuid}/url`)
}

export function fileSubmissionExportUrl(fileSubmissionUuid: string): string {
  return `${getAPIUrl()}file-submissions/${fileSubmissionUuid}/submissions/export`
}

export async function gradeFileSubmissionAttempt(
  fileSubmissionUuid: string,
  attemptUuid: string,
  payload: {
    final_score?: number | null
    feedback?: string
    rubric?: Record<string, unknown>
    status: 'GRADED' | 'PUBLISHED' | 'RETURNED'
  },
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  return apiJson<FileSubmissionAttempt>(`file-submissions/${fileSubmissionUuid}/submissions/${attemptUuid}/grade`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(version ? { 'If-Match': String(version) } : {}),
    },
    body: JSON.stringify({
      final_score: payload.final_score ?? null,
      feedback: payload.feedback ?? '',
      rubric: payload.rubric ?? {},
      status: payload.status,
    }),
  })
}

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
