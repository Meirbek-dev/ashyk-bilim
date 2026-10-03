import { randomUUID } from 'node:crypto'

import { createClient, createConfig, type Client } from '#/shared/api/gen/client'
import {
  enroll,
  courseLifecycle,
  createAssessment,
  createChapter,
  createCourse,
  createFileSubmission,
  createItem,
  createUpload,
  deleteCourse,
  finalizeUpload,
  lifecycle,
  login,
  logout,
  publishFileSubmission,
  reviewSubmission,
  saveFileSubmissionDraft,
  saveGrade,
  startSubmission,
  submit,
  submitSubmission,
} from '#/shared/api/gen/sdk.gen'
import type { GradeRequest, TeacherSubmission } from '#/shared/api/gen/types.gen'

import { randomIp, registerAccount } from '../fixtures/accounts'
import { expect as baseExpect, test as base } from '../fixtures/seed'

// Data of the grading spec through the generated SDK: a course of e2e-teacher with a quiz (a choice item, an open
// one) handed in by two fresh learners, or a file task with one PDF handed in. Each test gets its own; deleted after.

export const ru = { locale: 'ru' } as const
type Headers = { cookie: string }
type Learner = { name: string; submissionId: string }

export type Graded = {
  courseId: string
  activityId: string
  assessmentId: string
  quiz: string
  /** Ana answered the choice right, Boris wrong; both wrote a text. */
  ana: Learner
  boris: Learner
  /** A grade write as the teacher (a colleague), with the submission's current version. */
  grade: (submissionId: string, body: GradeRequest) => Promise<TeacherSubmission>
}

export type FileTask = { courseId: string; activityId: string; attemptId: string; name: string }

async function learnerSession(api: Client, baseUrl: string) {
  const account = await registerAccount(baseUrl)
  // A sign-in right after the registration is now and then refused (401) on the local stand: asked again briefly.
  let cookie = ''
  await baseExpect
    .poll(
      async () => {
        const signedIn = await login({
          client: api,
          body: { login: account.username, password: account.password },
          headers: { 'x-real-ip': randomIp() },
        })
        cookie = /^[^;]+/.exec(signedIn.response?.headers.get('set-cookie') ?? '')?.[0] ?? ''
        return signedIn.response?.status
      },
      { timeout: 10_000 },
    )
    .toBe(200)
  return { username: account.username, headers: { cookie } }
}

async function course(api: Client, teacher: Headers, name: string) {
  const call = { client: api, headers: teacher, throwOnError: true } as const
  const { data } = await createCourse({ ...call, body: { name } })
  const chapter = await createChapter({ ...call, path: { course_id: data.id }, body: { name: 'Глава' } })
  return { courseId: data.id, chapterId: chapter.data.id, call }
}

export const test = base.extend<{ graded: Graded; fileTask: FileTask }>({
  graded: async ({ baseURL, seed }, use) => {
    const api = createClient(createConfig({ baseUrl: String(baseURL) }))
    const teacher = { cookie: `${seed.accounts.teacher.cookie.name}=${seed.accounts.teacher.cookie.value}` }
    const quiz = `Проверка ${randomUUID().slice(0, 8)}`
    const { courseId, chapterId, call } = await course(api, teacher, `E2E grading ${randomUUID().slice(0, 8)}`)
    try {
      const assessment = await createAssessment({ ...call, body: { chapter_id: chapterId, kind: 'quiz', title: quiz } })
      const path = { assessment_id: assessment.data.id }
      const choice = await createItem({
        ...call,
        path,
        body: {
          title: 'Столица',
          max_score: 1,
          body: {
            kind: 'choice',
            prompt: 'Столица Казахстана?',
            explanation: null,
            variant: 'single_choice',
            options: [
              { id: 'a', text: 'Астана', is_correct: true },
              { id: 'b', text: 'Алматы', is_correct: false },
            ],
          },
        },
      })
      const essay = await createItem({
        ...call,
        path,
        body: {
          title: 'Почему',
          max_score: 10,
          body: { kind: 'open_text', prompt: 'Почему?', min_words: null, rubric: null },
        },
      })
      await lifecycle({ ...call, path, body: { to: 'published' } })
      await courseLifecycle({ ...call, path: { course_id: courseId }, body: { action: 'publish' } })
      const handIn = async (display: string, option: string): Promise<Learner> => {
        const learner = await learnerSession(api, String(baseURL))
        const asLearner = { client: api, headers: learner.headers, throwOnError: true } as const
        await enroll({ ...asLearner, path: { course_id: courseId } })
        const draft = await startSubmission({ ...asLearner, path })
        const answers = {
          [choice.data.id]: { kind: 'choice' as const, selected: [option] },
          [essay.data.id]: { kind: 'open_text' as const, text: `Ответ ${display}` },
        }
        await submitSubmission({ ...asLearner, path: { submission_id: draft.data.id }, body: { answers } })
        await logout({ client: api, headers: learner.headers })
        return { name: learner.username, submissionId: draft.data.id }
      }
      const ana = await handIn('ana', 'a')
      const boris = await handIn('boris', 'b')
      await use({
        courseId,
        activityId: assessment.data.activity_id,
        assessmentId: assessment.data.id,
        quiz,
        ana,
        boris,
        grade: async (submissionId, body) => {
          const target = { submission_id: submissionId }
          const { version } = (await reviewSubmission({ ...call, path: target })).data
          return (await saveGrade({ ...call, path: target, body, headers: { ...teacher, 'If-Match': version } })).data
        },
      })
    } finally {
      await deleteCourse({ client: api, path: { course_id: courseId }, headers: teacher })
    }
  },
  fileTask: async ({ baseURL, seed, page }, use) => {
    const api = createClient(createConfig({ baseUrl: String(baseURL) }))
    const teacher = { cookie: `${seed.accounts.teacher.cookie.name}=${seed.accounts.teacher.cookie.value}` }
    const { courseId, chapterId, call } = await course(api, teacher, `E2E grading files ${randomUUID().slice(0, 8)}`)
    try {
      const rubric = { criteria: [{ criterion_id: 'clarity', label: 'Ясность', max_score: 10 }] }
      const created = await createFileSubmission({
        ...call,
        body: { chapter_id: chapterId, title: 'Эссе', instructions: 'Приложите эссе.', rubric },
      })
      const task = { file_submission_id: created.data.id }
      await publishFileSubmission({ ...call, path: task })
      await courseLifecycle({ ...call, path: { course_id: courseId }, body: { action: 'publish' } })
      const learner = await learnerSession(api, String(baseURL))
      const asLearner = { client: api, headers: learner.headers, throwOnError: true } as const
      await enroll({ ...asLearner, path: { course_id: courseId } })
      const pdf = Buffer.from('%PDF-1.4\n%e2e\n')
      const slot = await createUpload({
        ...asLearner,
        body: { purpose: 'file-submission', mime: 'application/pdf', size_bytes: pdf.length },
      })
      await page.request.put(slot.data.put_url, {
        data: pdf,
        headers: { 'content-type': 'application/pdf', 'if-none-match': '*' },
      })
      await finalizeUpload({
        ...asLearner,
        path: { upload_id: slot.data.id },
        headers: { ...learner.headers, 'Idempotency-Key': slot.data.id },
      })
      const files = [{ upload_id: slot.data.id, display_name: 'essay-1.pdf' }]
      await saveFileSubmissionDraft({ ...asLearner, path: task, body: { files } })
      const attempt = await submit({ ...asLearner, path: task, body: {} })
      await logout({ client: api, headers: learner.headers })
      await use({ courseId, activityId: created.data.activity_id, attemptId: attempt.data.id, name: learner.username })
    } finally {
      await deleteCourse({ client: api, path: { course_id: courseId }, headers: teacher })
    }
  },
})

// Under `vp dev` a fresh context loads the review's modules unbundled: the first render can be slow.
export const expect = baseExpect.configure({ timeout: 15_000 })
