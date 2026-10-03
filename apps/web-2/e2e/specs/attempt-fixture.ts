import { randomUUID } from 'node:crypto'

import { createClient, createConfig } from '#/shared/api/gen/client'
import {
  createAssessment,
  createItem,
  getCurriculum,
  lifecycle,
  mySubmissions,
  setPolicy,
} from '#/shared/api/gen/sdk.gen'
import type {
  AssessmentId,
  AssessmentKind,
  CreateItemRequest,
  Policy,
  StudentSubmission,
} from '#/shared/api/gen/types.gen'

import { expect as baseExpect, type MadeCourse, test as base } from '../fixtures/learning'

// Data of attempt.spec.ts through the generated SDK: the seeded teacher builds a published quiz or exam in a fresh
// course; a fresh learner (fixtures/learning.ts) enrols and takes it. `attempts()` reads the learner's attempts back.

export const ru = { locale: 'ru' } as const

export const items = {
  single: {
    title: 'Столица Казахстана',
    max_score: 1,
    body: {
      kind: 'choice',
      variant: 'single_choice',
      explanation: null,
      prompt: 'Выберите город.',
      options: [
        { id: 'astana', text: 'Астана', is_correct: true },
        { id: 'almaty', text: 'Алматы', is_correct: false },
      ],
    },
  },
  multiple: {
    title: 'Чётные числа',
    max_score: 1,
    body: {
      kind: 'choice',
      variant: 'multiple_choice',
      multiple: true,
      explanation: null,
      prompt: 'Отметьте все чётные.',
      options: [
        { id: 'two', text: 'Два', is_correct: true },
        { id: 'three', text: 'Три', is_correct: false },
        { id: 'four', text: 'Четыре', is_correct: true },
      ],
    },
  },
  matching: {
    title: 'Пары',
    max_score: 1,
    body: {
      kind: 'matching',
      explanation: null,
      prompt: 'Сопоставьте.',
      pairs: [
        { left: 'Кошка', right: 'Мяу' },
        { left: 'Собака', right: 'Гав' },
      ],
    },
  },
  form: {
    title: 'Анкета',
    max_score: 1,
    body: {
      kind: 'form',
      prompt: 'Заполните.',
      fields: [{ id: 'city', label: 'Город', field_type: 'text', required: true }],
    },
  },
  open: {
    title: 'Эссе',
    max_score: 1,
    body: { kind: 'open_text', min_words: null, rubric: null, prompt: 'Напишите пару слов.' },
  },
} satisfies Record<string, CreateItemRequest>

type QuizSpec = { kind?: AssessmentKind; policy?: Partial<Policy>; questions?: CreateItemRequest[] }
export type MadeQuiz = { course: MadeCourse; assessmentId: AssessmentId; url: string }

export const test = base.extend<{
  makeQuiz: (spec?: QuizSpec) => Promise<MadeQuiz>
  attempts: (quiz: MadeQuiz) => Promise<StudentSubmission[]>
}>({
  makeQuiz: async ({ baseURL, seed, makeCourse }, use) => {
    const api = createClient(createConfig({ baseUrl: String(baseURL) }))
    const { name, value } = seed.accounts.teacher.cookie
    const headers = { cookie: `${name}=${value}` }
    await use(async ({ kind = 'quiz', policy, questions = [items.single] } = {}) => {
      const course = await makeCourse({ activities: 1 })
      const { data: curriculum } = await getCurriculum({
        client: api,
        path: { course_id: course.id },
        headers,
        throwOnError: true,
      })
      const chapterId = curriculum.chapters[0]?.id ?? ''
      const title = `E2E ${kind} ${randomUUID().slice(0, 8)}`
      const { data: assessment } = await createAssessment({
        client: api,
        body: { chapter_id: chapterId, kind, title },
        headers,
        throwOnError: true,
      })
      const path = { assessment_id: assessment.id }
      if (policy)
        await setPolicy({ client: api, path, body: { ...assessment.policy, ...policy }, headers, throwOnError: true })
      for (const body of questions) await createItem({ client: api, path, body, headers, throwOnError: true })
      await lifecycle({ client: api, path, body: { to: 'published' }, headers, throwOnError: true })
      course.activityIds.push(assessment.activity_id)
      return { course, assessmentId: assessment.id, url: `/learn/${course.id}/${assessment.activity_id}/attempt` }
    })
  },
  // The learner's own view of their attempts, read with the cookie the browser carries.
  attempts: async ({ baseURL, context }, use) => {
    const api = createClient(createConfig({ baseUrl: String(baseURL) }))
    await use(async quiz => {
      const cookies = await context.cookies(String(baseURL))
      const cookie = cookies.map(entry => `${entry.name}=${entry.value}`).join('; ')
      const { data } = await mySubmissions({
        client: api,
        path: { assessment_id: quiz.assessmentId },
        headers: { cookie },
        throwOnError: true,
      })
      return data
    })
  },
})

// Under `vp dev` the attempt route's modules load unbundled: allow the first render more than the default 5 s.
export const expect = baseExpect.configure({ timeout: 15_000 })
