/**
 * File submissions on the v2 contract (DECISIONS "File submissions (2026-09-05, P5.1)").
 *
 * Ids are UUID strings, timestamps are `*_unix`, statuses are lower-case.
 * Learner files go through `uploadFile(file, 'file-submission')` and the
 * finalized upload `id` is attached to the draft; the API never sees bytes.
 * Attempt `version` is the optimistic lock: optional `If-Match` on learner
 * saves/submits (412 when stale), required on grader writes.
 */
import { apiJson } from '@/lib/api-client'
import { idempotencyHeaders, ifMatchHeaders } from '@/lib/api/headers'
import { Attempt, FileReviewPage, FileSubmission, SignedDownload } from '@/lib/api/generated/zod'
import type {
  AttachedFile,
  Attempt as AttemptType,
  CreateFileSubmissionRequest,
  FileAttemptStatus,
  FileGradeRequest,
  FileRefRequest,
  FileReviewItem,
  FileReviewPage as FileReviewPageType,
  FileSubmission as FileSubmissionType,
  SignedDownload as SignedDownloadType,
  UpdateFileSubmissionBody,
} from '@/lib/api/generated/zod'
import { getAPIUrl } from '@services/config/config'
import { uploadFile } from '@services/media/uploads'
import type { UploadProgress } from '@services/media/uploads'

export type FileSubmissionActivity = FileSubmissionType
export type FileSubmissionAttempt = AttemptType
export type FileSubmissionAttemptFile = AttachedFile
export type FileSubmissionAttemptStatus = FileAttemptStatus
export type FileSubmissionReviewItem = FileReviewItem
export type FileSubmissionReviewQueue = FileReviewPageType
export type FileSubmissionFileRef = FileRefRequest
export type FileSubmissionCreatePayload = CreateFileSubmissionRequest
export type FileSubmissionUpdatePayload = UpdateFileSubmissionBody
export type FileSubmissionGradePayload = FileGradeRequest

const json = (method: 'POST' | 'PATCH', body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

const id = (value: string) => encodeURIComponent(value)

const parseFileSubmission = (data: unknown) => FileSubmission.parse(data)
const parseAttempt = (data: unknown) => Attempt.parse(data)
const parseAttempts = (data: unknown) => Attempt.array().parse(data)
const parseReviewPage = (data: unknown) => FileReviewPage.parse(data)
const parseSignedDownload = (data: unknown) => SignedDownload.parse(data)

export async function getFileSubmissionByActivity(activityId: string): Promise<FileSubmissionActivity> {
  return apiJson(`activities/${id(activityId)}/file-submission`, { timeoutMs: 10_000 }, parseFileSubmission)
}

export async function createFileSubmissionActivity(
  payload: FileSubmissionCreatePayload,
): Promise<FileSubmissionActivity> {
  return apiJson('file-submissions', json('POST', payload), parseFileSubmission)
}

export async function updateFileSubmissionActivity(
  fileSubmissionId: string,
  payload: FileSubmissionUpdatePayload,
): Promise<FileSubmissionActivity> {
  return apiJson(`file-submissions/${id(fileSubmissionId)}`, json('PATCH', payload), parseFileSubmission)
}

export async function publishFileSubmissionActivity(fileSubmissionId: string): Promise<FileSubmissionActivity> {
  return apiJson(`file-submissions/${id(fileSubmissionId)}/publish`, { method: 'POST' }, parseFileSubmission)
}

/** Open a draft attempt (201) or return the open one (200). */
export async function startFileSubmissionDraft(fileSubmissionId: string): Promise<FileSubmissionAttempt> {
  return apiJson(`file-submissions/${id(fileSubmissionId)}/draft`, { method: 'POST' }, parseAttempt)
}

/** Replace the draft's file list. `If-Match` is optional; stale → 412 `precondition-failed`. */
export async function saveFileSubmissionDraft(
  fileSubmissionId: string,
  files: FileSubmissionFileRef[],
  version?: number | null,
): Promise<FileSubmissionAttempt> {
  return apiJson(
    `file-submissions/${id(fileSubmissionId)}/draft`,
    json('PATCH', { files }, ifMatchHeaders(version)),
    parseAttempt,
  )
}

/** Submit the open attempt, optionally replacing its files first. Reuse `idempotencyKey` when retrying. */
export async function submitFileSubmission(
  fileSubmissionId: string,
  files: FileSubmissionFileRef[] | null,
  version?: number | null,
  idempotencyKey?: string,
): Promise<FileSubmissionAttempt> {
  return apiJson(
    `file-submissions/${id(fileSubmissionId)}/submit`,
    json('POST', files ? { files } : {}, { ...ifMatchHeaders(version), ...idempotencyHeaders(idempotencyKey) }),
    parseAttempt,
  )
}

/** Presigned upload for one learner file; the returned `id` is what the draft attaches. */
export async function uploadSubmissionFile(file: File, onProgress?: (progress: UploadProgress) => void) {
  return uploadFile(file, 'file-submission', onProgress ? { onProgress } : {})
}

export async function getMyFileSubmissionAttempts(fileSubmissionId: string): Promise<FileSubmissionAttempt[]> {
  return apiJson(`file-submissions/${id(fileSubmissionId)}/me`, {}, parseAttempts)
}

export interface FileSubmissionReviewQueueParams {
  status?: FileSubmissionAttemptStatus | 'ALL'
  search?: string
  cursor?: string | null
  limit?: number
}

/** Keyset page of submitted attempts for grading (`{items, next_cursor}`). */
export async function getFileSubmissionReviewQueue(
  fileSubmissionId: string,
  params: FileSubmissionReviewQueueParams = {},
): Promise<FileSubmissionReviewQueue> {
  const searchParams = new URLSearchParams()
  const search = params.search?.trim()
  if (params.status && params.status !== 'ALL') searchParams.set('status', params.status)
  if (search) searchParams.set('search', search)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.limit) searchParams.set('limit', String(params.limit))
  const query = searchParams.toString()
  return apiJson(`file-submissions/${id(fileSubmissionId)}/submissions${query ? `?${query}` : ''}`, {}, parseReviewPage)
}

/** Full attempt (files, feedback, rubric scores) for a grader or its owner. */
export async function getFileSubmissionReviewAttempt(attemptId: string): Promise<FileSubmissionAttempt> {
  return apiJson(`file-submission-attempts/${id(attemptId)}`, {}, parseAttempt)
}

export async function getFileSubmissionFileUrl(fileId: string): Promise<SignedDownloadType> {
  return apiJson(`file-submission-files/${id(fileId)}/url`, {}, parseSignedDownload)
}

export function fileSubmissionExportUrl(fileSubmissionId: string): string {
  return `${getAPIUrl().replace(/\/+$/, '')}/file-submissions/${id(fileSubmissionId)}/submissions/export`
}

/** Save/publish/return a grade. `If-Match` with the attempt's current `version` is required (412 when stale). */
export async function gradeFileSubmissionAttempt(
  attemptId: string,
  payload: FileSubmissionGradePayload,
  version: number,
): Promise<FileSubmissionAttempt> {
  return apiJson(
    `file-submission-attempts/${id(attemptId)}/grade`,
    json('PATCH', payload, ifMatchHeaders(version)),
    parseAttempt,
  )
}
