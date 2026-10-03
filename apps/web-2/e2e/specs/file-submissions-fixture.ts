import type { BrowserContext } from '@playwright/test'

import {
  createFileSubmission,
  createUpload,
  finalizeUpload,
  getCurriculum,
  gradeAttempt,
  publishFileSubmission,
  saveFileSubmissionDraft,
  submit,
} from '#/shared/api/gen/sdk.gen'
import type { Attempt, ConfigPatch, FileGradeRequest, FileSubmission } from '#/shared/api/gen/types.gen'

import { expect as baseExpect, type MadeCourse, test as base } from '../fixtures/learning'

// Data of the file-submissions specs through the generated SDK: a task in a made course (the teacher's), files
// uploaded and handed in as the learner, grades given as the teacher. Shared by file-submissions*.spec.ts.

export const ru = { locale: 'ru' } as const
export const PDF = Buffer.from('%PDF-1.4\n%e2e\n')
type Headers = { cookie: string }
type TaskSpec = ConfigPatch & { publish?: boolean }

export type Tasks = {
  teacher: Headers
  /** A task in the course's first chapter; published (with instructions) unless `publish: false`. */
  make: (course: MadeCourse, spec?: TaskSpec) => Promise<FileSubmission>
  /** The signed-in browser's session as API headers (the learner after `learner.signIn()`). */
  headersOf: (context: BrowserContext) => Promise<Headers>
  /** A finalized `file-submission` upload of the caller; its id. */
  upload: (headers: Headers, mime?: string, bytes?: Buffer) => Promise<string>
  /** Attaches the uploads (named essay-1.pdf, essay-2.pdf...) to the learner's draft. */
  attach: (task: FileSubmission, headers: Headers, uploads: string[]) => Promise<Attempt>
  /** Attaches the uploads and submits, as the learner. */
  handIn: (task: FileSubmission, headers: Headers, uploads: string[]) => Promise<Attempt>
  grade: (attempt: Attempt, body: FileGradeRequest) => Promise<Attempt>
}

export const test = base.extend<{ tasks: Tasks }>({
  tasks: async ({ api, seed, page }, use) => {
    const { name, value } = seed.accounts.teacher.cookie
    const teacher = { cookie: `${name}=${value}` }
    const attach: Tasks['attach'] = async (task, headers, uploads) => {
      const files = uploads.map((upload_id, index) => ({ upload_id, display_name: `essay-${index + 1}.pdf` }))
      const path = { file_submission_id: task.id }
      const { data } = await saveFileSubmissionDraft({
        client: api,
        path,
        body: { files },
        headers,
        throwOnError: true,
      })
      return data
    }
    await use({
      teacher,
      make: async (course, { publish = true, ...config } = {}) => {
        const path = { course_id: course.id }
        const { data: curriculum } = await getCurriculum({ client: api, path, headers: teacher, throwOnError: true })
        const body = {
          chapter_id: curriculum.chapters[0]?.id ?? '',
          title: 'Эссе',
          instructions: 'Напишите **эссе** и приложите файл.',
          ...config,
        }
        const { data } = await createFileSubmission({ client: api, body, headers: teacher, throwOnError: true })
        course.activityIds.push(data.activity_id)
        if (!publish) return data
        const task = { file_submission_id: data.id }
        const published = await publishFileSubmission({ client: api, path: task, headers: teacher, throwOnError: true })
        return published.data
      },
      headersOf: async context => {
        const session = (await context.cookies()).find(cookie => cookie.name === 'ab_session')
        if (!session) throw new Error('the browser has no session: sign in first')
        return { cookie: `${session.name}=${session.value}` }
      },
      upload: async (headers, mime = 'application/pdf', bytes = PDF) => {
        const body = { purpose: 'file-submission' as const, mime, size_bytes: bytes.length }
        const slot = await createUpload({ client: api, body, headers, throwOnError: true })
        // Straight to storage, as the browser would (the presigned PUT is not an API call).
        await page.request.put(slot.data.put_url, {
          data: bytes,
          headers: { 'content-type': mime, 'if-none-match': '*' },
        })
        const finalize = { ...headers, 'Idempotency-Key': slot.data.id }
        await finalizeUpload({ client: api, path: { upload_id: slot.data.id }, headers: finalize, throwOnError: true })
        return slot.data.id
      },
      attach,
      handIn: async (task, headers, uploads) => {
        await attach(task, headers, uploads)
        const path = { file_submission_id: task.id }
        const { data } = await submit({ client: api, path, body: {}, headers, throwOnError: true })
        return data
      },
      grade: async (attempt, body) => {
        const { data } = await gradeAttempt({
          client: api,
          path: { attempt_id: attempt.id },
          body,
          headers: { ...teacher, 'If-Match': attempt.version },
          throwOnError: true,
        })
        return data
      },
    })
  },
})

// Under `vp dev` a fresh context loads the editor and markdown modules unbundled: the first render can be slow.
export const expect = baseExpect.configure({ timeout: 15_000 })
