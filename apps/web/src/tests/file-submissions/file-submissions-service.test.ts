/**
 * File-submission service on the v2 contract: route set, JSON bodies,
 * `If-Match` / `Idempotency-Key` headers, and uploads via the presigned
 * pipeline (never multipart through the API).
 */

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  uploadFile: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@services/media/uploads', () => ({ uploadFile: mocks.uploadFile }))
vi.mock('@services/config/config', () => ({ getAPIUrl: () => 'http://api.test/api/v2/' }))

import {
  fileSubmissionExportUrl,
  getFileSubmissionByActivity,
  getFileSubmissionFileUrl,
  getFileSubmissionReviewAttempt,
  getFileSubmissionReviewQueue,
  gradeFileSubmissionAttempt,
  saveFileSubmissionDraft,
  submitFileSubmission,
  uploadSubmissionFile,
} from '@/features/file-submissions/services/file-submissions'

const FS_ID = '01a09100-0000-7000-8000-000000000001'
const ATTEMPT_ID = '01a09100-0000-7000-8000-000000000002'
const FILE_ID = '01a09100-0000-7000-8000-000000000003'
const UPLOAD_ID = '01a09100-0000-7000-8000-000000000004'

function attempt() {
  return {
    id: ATTEMPT_ID,
    status: 'draft',
    attempt_number: 1,
    files: [
      {
        id: FILE_ID,
        upload_id: UPLOAD_ID,
        filename: 'essay.pdf',
        content_type: 'application/pdf',
        size_bytes: 10,
        scan_status: 'pending',
        position: 1,
        created_at_unix: 1,
      },
    ],
    is_late: false,
    late_penalty_pct: 0,
    final_score: null,
    feedback: null,
    rubric_scores: null,
    version: 3,
    started_at_unix: 1,
    submitted_at_unix: null,
    graded_at_unix: null,
    created_at_unix: 1,
    updated_at_unix: 1,
    user: null,
  }
}

function lastCall() {
  const call = mocks.apiJson.mock.calls.at(-1)!
  const init = (call[1] ?? {}) as { method?: string; headers?: Record<string, string>; body?: string }
  return {
    path: call[0] as string,
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
    body: init.body ? (JSON.parse(init.body) as unknown) : undefined,
    parse: call[2] as ((data: unknown) => unknown) | undefined,
  }
}

describe('file-submissions service (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiJson.mockImplementation(async (_path, _init, parse) => (parse ? parse(attempt()) : attempt()))
  })

  it('reads the activity config from GET activities/{id}/file-submission', async () => {
    mocks.apiJson.mockResolvedValueOnce({ id: FS_ID })
    await getFileSubmissionByActivity('01a09100-0000-7000-8000-0000000000aa')
    expect(lastCall().path).toBe('activities/01a09100-0000-7000-8000-0000000000aa/file-submission')
    expect(lastCall().method).toBe('GET')
  })

  it('saves a learner draft with {files:[{upload_id}]} and a quoted If-Match', async () => {
    const saved = await saveFileSubmissionDraft(FS_ID, [{ upload_id: UPLOAD_ID, display_name: 'essay.pdf' }], 3)
    const call = lastCall()
    expect(call.path).toBe(`file-submissions/${FS_ID}/draft`)
    expect(call.method).toBe('PATCH')
    expect(call.headers['If-Match']).toBe('"3"')
    expect(call.body).toEqual({ files: [{ upload_id: UPLOAD_ID, display_name: 'essay.pdf' }] })
    expect(saved.version).toBe(3)
  })

  it('omits If-Match on a first draft save (no attempt yet)', async () => {
    await saveFileSubmissionDraft(FS_ID, [], null)
    expect(lastCall().headers['If-Match']).toBeUndefined()
  })

  it('submits with an Idempotency-Key, If-Match and the optional file list', async () => {
    await submitFileSubmission(FS_ID, [{ upload_id: UPLOAD_ID }], 3, 'idem-1')
    const call = lastCall()
    expect(call.path).toBe(`file-submissions/${FS_ID}/submit`)
    expect(call.method).toBe('POST')
    expect(call.headers['Idempotency-Key']).toBe('idem-1')
    expect(call.headers['If-Match']).toBe('"3"')
    expect(call.body).toEqual({ files: [{ upload_id: UPLOAD_ID }] })

    await submitFileSubmission(FS_ID, null)
    expect(lastCall().body).toEqual({})
    expect(lastCall().headers['Idempotency-Key']).toEqual(expect.any(String))
  })

  it('uploads learner files through uploadFile(file, "file-submission"), never the API', async () => {
    mocks.uploadFile.mockResolvedValue({ id: UPLOAD_ID, key: 'file-submission/abc', size_bytes: 3 })
    const file = new File(['abc'], 'essay.pdf', { type: 'application/pdf' })
    const onProgress = vi.fn()
    const result = await uploadSubmissionFile(file, onProgress)
    expect(mocks.uploadFile).toHaveBeenCalledWith(file, 'file-submission', { onProgress })
    expect(result.id).toBe(UPLOAD_ID)
    expect(mocks.apiJson).not.toHaveBeenCalled()
  })

  it('pages the review queue by cursor with lower-case status filters', async () => {
    mocks.apiJson.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getFileSubmissionReviewQueue(FS_ID, { status: 'submitted', search: ' aru ', cursor: ATTEMPT_ID, limit: 25 })
    expect(lastCall().path).toBe(
      `file-submissions/${FS_ID}/submissions?status=submitted&search=aru&cursor=${ATTEMPT_ID}&limit=25`,
    )

    mocks.apiJson.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getFileSubmissionReviewQueue(FS_ID, { status: 'ALL' })
    expect(lastCall().path).toBe(`file-submissions/${FS_ID}/submissions`)
  })

  it('reads one attempt and grades it on file-submission-attempts/{id} with a required If-Match', async () => {
    await getFileSubmissionReviewAttempt(ATTEMPT_ID)
    expect(lastCall().path).toBe(`file-submission-attempts/${ATTEMPT_ID}`)

    await gradeFileSubmissionAttempt(ATTEMPT_ID, { action: 'publish', final_score: 88, feedback: 'ok' }, 3)
    const call = lastCall()
    expect(call.path).toBe(`file-submission-attempts/${ATTEMPT_ID}/grade`)
    expect(call.method).toBe('PATCH')
    expect(call.headers['If-Match']).toBe('"3"')
    expect(call.body).toEqual({ action: 'publish', final_score: 88, feedback: 'ok' })
  })

  it('resolves signed file URLs and the CSV export on the v2 paths', async () => {
    mocks.apiJson.mockResolvedValueOnce({
      file_id: FILE_ID,
      url: 'http://storage/x',
      expires_at_unix: 1,
      filename: 'essay.pdf',
      content_type: 'application/pdf',
    })
    const signed = await getFileSubmissionFileUrl(FILE_ID)
    expect(lastCall().path).toBe(`file-submission-files/${FILE_ID}/url`)
    expect(signed.url).toBe('http://storage/x')
    expect(fileSubmissionExportUrl(FS_ID)).toBe(`http://api.test/api/v2/file-submissions/${FS_ID}/submissions/export`)
  })
})
