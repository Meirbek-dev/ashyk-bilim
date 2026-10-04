import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createAssessment, getCurriculum, lifecycle, updateItem } from '#/shared/api/gen/sdk.gen'
import type {
  AssessmentDetail,
  CaseResult,
  CodeBody,
  CodeRun,
  ItemMetadata,
  LanguageInfo,
  StudentSubmission,
} from '#/shared/api/gen/types.gen'

import { expect as baseExpect, type MadeCourse, test as base } from '../fixtures/learning'
import { expectOutage, expectReread } from '../fixtures/test'

// Data of the code-arena specs through the generated SDK: a code challenge in a made course (the teacher's), its code
// item filled and published. Judge0 is not part of the local stack: the language list, runs and reference checks
// are answered with `page.route` fixtures; specs tagged @judge0 need the real judge.

export const ru = { locale: 'ru' } as const
type Headers = { cookie: string }

const LANGUAGES: LanguageInfo[] = [
  { id: 71, name: 'Python (3.8.1)', monaco_language: 'python' },
  { id: 63, name: 'JavaScript (Node.js 12.14.0)', monaco_language: 'javascript' },
]

const SUM: CodeBody = {
  prompt: 'Прочитайте два числа и выведите их **сумму**.',
  input_spec: 'Два целых числа через пробел.',
  output_spec: 'Одно число.',
  constraints: ['1 <= a, b <= 100'],
  languages: [71, 63],
  starter_code: { '71': 'a, b = map(int, input().split())\n', '63': 'const [a, b] = [1, 2]\n' },
  reference_solutions: { '71': 'a, b = map(int, input().split())\nprint(a + b)\n' },
  tests: [
    { id: 'visible-1', description: null, input: '1 2', expected_output: '3', is_visible: true, weight: 1 },
    {
      id: 'hidden-1',
      description: 'Большие числа',
      input: '40 60',
      expected_output: '100',
      is_visible: false,
      weight: 1,
    },
  ],
  time_limit_seconds: 2,
  memory_limit_mb: 128,
  max_output_kb: null,
}

const EASY: ItemMetadata = { difficulty: 'easy', estimated_minutes: null, section_label: null }

export type Made = { assessment: AssessmentDetail; activityId: string; itemId: string }

export type Challenges = {
  teacher: Headers
  /** A code challenge in the course's first chapter; filled with `body` and published unless `publish: false`. */
  make: (course: MadeCourse, options?: { body?: CodeBody | null; publish?: boolean }) => Promise<Made>
}

export const test = base.extend<{ challenges: Challenges }>({
  challenges: async ({ api, seed }, use) => {
    const { name, value } = seed.accounts.teacher.cookie
    const teacher = { cookie: `${name}=${value}` }
    await use({
      teacher,
      make: async (course, { body = SUM, publish = true } = {}) => {
        const path = { course_id: course.id }
        const { data: curriculum } = await getCurriculum({ client: api, path, headers: teacher, throwOnError: true })
        const chapter = curriculum.chapters[0]?.id ?? ''
        const { data: assessment } = await createAssessment({
          client: api,
          body: { chapter_id: chapter, kind: 'code_challenge', title: 'Сумма двух чисел' },
          headers: teacher,
          throwOnError: true,
        })
        const itemId = assessment.items[0]?.id ?? ''
        if (body) {
          await updateItem({
            client: api,
            path: { item_id: itemId },
            body: { body: { ...body, kind: 'code' }, metadata: EASY, title: 'Сумма двух чисел' },
            headers: teacher,
            throwOnError: true,
          })
        }
        if (publish) {
          await lifecycle({
            client: api,
            path: { assessment_id: assessment.id },
            body: { to: 'published' },
            headers: teacher,
            throwOnError: true,
          })
        }
        course.activityIds.push(assessment.activity_id)
        return { assessment, activityId: assessment.activity_id, itemId }
      },
    })
  },
})

/** The platform's languages as a configured sandbox lists them (fetched by the browser on client navigation). */
export const routeLanguages = (page: Page) =>
  page.route('**/api/v2/code/runner', route =>
    route.fulfill({ json: { runner_configured: true, languages: LANGUAGES } }),
  )

/** The runner answers that it is configured but down (B-COD-23); "Retry" and a remount read it again. */
export async function routeRunnerDown(page: Page) {
  expectOutage(page)
  expectReread(page, '/api/v2/code/runner')
  await page.route('**/api/v2/code/runner', route => route.fulfill(runnerDown))
}

export const runnerDown = {
  status: 503,
  contentType: 'application/problem+json',
  json: { type: 'about:blank', title: 'code-runner-degraded', status: 503, code: 'code-runner-degraded' },
}

/** Opens the challenge from the player's entry card ("Start" or "Continue"): a client navigation, so the browser reads what is routed. */
export async function openFromPlayer(page: Page, course: MadeCourse, made: Made) {
  await page.goto(`/learn/${course.id}/${made.activityId}`)
  const entry = new RegExp(`^(${m.player_entry_start({}, ru)}|${m.player_continue({}, ru)})$`)
  await page.getByRole('link', { name: entry }).click()
  await baseExpect(page).toHaveURL(new RegExp(`/learn/${course.id}/${made.activityId}/code`))
}

export const region = (page: Page, name: string) => page.getByRole('region', { name })
export const editor = (page: Page) => page.getByRole('textbox', { name: m.code_editor_label({}, ru) })

export async function typeCode(page: Page, code: string) {
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(code)
}

/** "Start" on the entry: the attempt opens in the editor. */
export async function start(page: Page) {
  await region(page, m.code_solution({}, ru))
    .getByRole('button', { name: m.code_start({}, ru) })
    .click()
  await expect(editor(page)).toBeVisible()
}

const passed = (id: string, input: string, output: string): CaseResult => ({
  test_id: id,
  description: '',
  passed: true,
  is_visible: true,
  status_id: 3,
  status_description: 'Accepted',
  stdin: input,
  expected: output,
  actual: output,
  stdout: output,
  stderr: null,
  compile_output: null,
  message: null,
  time_seconds: 0.012,
  memory_kb: 7800,
  weight: 1,
})

/** A finished run of the visible tests as the server answers it: one passed, one runtime error. */
export const runOf = (made: Made, id: string): CodeRun => ({
  id,
  assessment_id: made.assessment.id,
  item_id: made.itemId,
  submission_id: null,
  language_id: 71,
  purpose: 'visible',
  status: 'wrong_answer',
  passed: 1,
  total: 2,
  score: 50,
  replayed: false,
  compile_output: null,
  error_message: null,
  created_at_unix: 1,
  finished_at_unix: 2,
  cases: [
    passed('visible-1', '1 2', '3'),
    { ...passed('visible-2', '5 5', '10'), passed: false, status_id: 11, actual: '', stdout: '', stderr: 'Error' },
  ],
})

const now = () => Math.floor(Date.now() / 1000)

/** A handed-in attempt graded 50 % (1 of 2 test cases) and released, as `GET .../submissions/me` lists it. */
export const gradedAttempt = (made: Made, id: string): StudentSubmission => ({
  id,
  assessment_id: made.assessment.id,
  attempt_number: 1,
  status: 'published',
  release_state: 'visible',
  answers: { [made.itemId]: { kind: 'code', language: 71, source: 'print(1 + 2)' } },
  answered_count: 1,
  total_items: 1,
  final_score: 50,
  auto_score: 50,
  grading: {
    items: [
      {
        item_id: made.itemId,
        correct: false,
        correct_answer: null,
        max_score: 100,
        score: 50,
        user_answer: null,
        feedback_code: 'tests-passed',
        feedback_params: { correct: 1, total: 2 },
      },
    ],
  },
  draft_version: 3,
  started_at_unix: now() - 600,
  submitted_at_unix: now() - 60,
  graded_at_unix: now(),
  auto_submit_reason: null,
  is_late: false,
  late_penalty_pct: null,
  time_remaining_seconds: null,
  violation_count: 0,
})

// Under `vp dev` a fresh context loads the editor modules unbundled: the first render can be slow.
export const expect = baseExpect.configure({ timeout: 15_000 })
