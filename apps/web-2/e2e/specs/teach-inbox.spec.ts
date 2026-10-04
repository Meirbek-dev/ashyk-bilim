import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import {
  enroll,
  courseLifecycle,
  createAssessment,
  createChapter,
  createCourse,
  createItem,
  deleteCourse,
  lifecycle,
  login,
  logout,
  startSubmission,
  submitSubmission,
} from '#/shared/api/gen/sdk.gen'

import { randomIp, registerAccount } from '../fixtures/accounts'
import { expect, test as base } from '../fixtures/seed'
import { expectReread } from '../fixtures/test'

// The teacher inbox (slice 6.2). Each test makes a course of e2e-teacher with one quiz (an open-text item, so the
// hand-in waits for a grade) and a fresh learner who hands it in, all through the generated SDK.

const ru = { locale: 'ru' } as const

type HandedIn = { courseId: string; courseName: string; activityId: string; quiz: string; submissionId: string }

const test = base.extend<{ handedIn: HandedIn }>({
  handedIn: async ({ baseURL, seed }, use) => {
    const api = createClient(createConfig({ baseUrl: String(baseURL) }))
    const { name, value } = seed.accounts.teacher.cookie
    const teacher = { cookie: `${name}=${value}` }
    const courseName = `E2E inbox ${randomUUID().slice(0, 8)}`
    const quiz = `Эссе ${randomUUID().slice(0, 8)}`
    const { data: course } = await createCourse({
      client: api,
      body: { name: courseName },
      headers: teacher,
      throwOnError: true,
    })
    const call = { client: api, headers: teacher, throwOnError: true } as const
    try {
      const chapter = await createChapter({ ...call, path: { course_id: course.id }, body: { name: 'Глава' } })
      const assessment = await createAssessment({
        ...call,
        body: { chapter_id: chapter.data.id, kind: 'quiz', title: quiz },
      })
      const item = await createItem({
        ...call,
        path: { assessment_id: assessment.data.id },
        body: {
          title: 'Почему?',
          max_score: 10,
          body: { kind: 'open_text', prompt: 'Почему?', min_words: null, rubric: null },
        },
      })
      await lifecycle({ ...call, path: { assessment_id: assessment.data.id }, body: { to: 'published' } })
      await courseLifecycle({ ...call, path: { course_id: course.id }, body: { action: 'publish' } })

      const account = await registerAccount(String(baseURL))
      const signedIn = await login({
        client: api,
        body: { login: account.username, password: account.password },
        headers: { 'x-real-ip': randomIp() },
        throwOnError: true,
      })
      const learner = { cookie: /^[^;]+/.exec(signedIn.response.headers.get('set-cookie') ?? '')?.[0] ?? '' }
      const asLearner = { client: api, headers: learner, throwOnError: true } as const
      await enroll({ ...asLearner, path: { course_id: course.id } })
      const draft = await startSubmission({ ...asLearner, path: { assessment_id: assessment.data.id } })
      await submitSubmission({
        ...asLearner,
        path: { submission_id: draft.data.id },
        body: { answers: { [item.data.id]: { kind: 'open_text', text: 'Потому что.' } } },
      })
      await logout({ client: api, headers: learner })
      await use({
        courseId: course.id,
        courseName,
        activityId: assessment.data.activity_id,
        quiz,
        submissionId: draft.data.id,
      })
    } finally {
      await deleteCourse({ client: api, path: { course_id: course.id }, headers: teacher })
    }
  },
})

const row = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text })

test('B-INB-01 B-INB-02 B-INB-03 a hand-in waits in the teacher queue and leads straight into its review', async ({
  page,
  signInAs,
  handedIn,
}) => {
  await signInAs('teacher')
  await page.goto('/teach')
  await expect(page.getByRole('heading', { level: 1, name: m.platform_nav_inbox({}, ru) })).toBeVisible()
  const line = row(page, handedIn.quiz)
  await expect(line).toContainText(handedIn.courseName)
  await expect(line).toContainText(m.inbox_kind_needs_grading({}, ru))
  await expect(line.getByRole('link', { name: m.inbox_action_grade({}, ru) })).toHaveAttribute(
    'href',
    `/teach/courses/${handedIn.courseId}/activities/${handedIn.activityId}/submissions/${handedIn.submissionId}`,
  )
})

test('B-INB-04 B-INB-05 kind and course filters live in the URL; nothing found offers a reset', async ({
  page,
  signInAs,
  handedIn,
}) => {
  await signInAs('teacher')
  // The shared teacher grades every parallel test's course: their events re-read the inbox (B-NOT-14), by design.
  expectReread(page, '/api/v2/work')
  await page.goto('/teach')
  const kinds = page.getByRole('navigation', { name: m.inbox_state({}, ru) })
  await kinds.getByRole('link', { name: m.inbox_kind_awaiting_release({}, ru) }).click()
  await expect(page).toHaveURL(/\/teach\?kind=awaiting_release$/)
  await expect(row(page, handedIn.quiz)).toHaveCount(0)
  await kinds.getByRole('link', { name: m.inbox_kind_needs_grading({}, ru) }).click()
  await expect(page).toHaveURL(/\/teach\?kind=needs_grading$/)
  await expect(row(page, handedIn.quiz)).toBeVisible()

  await page.getByRole('button', { name: m.inbox_course_all({}, ru) }).click()
  await page.getByRole('menuitemradio', { name: handedIn.courseName }).click()
  await expect(page).toHaveURL(new RegExp(`course=${handedIn.courseId}`))
  await expect(page).toHaveURL(/kind=needs_grading/)
  await expect(row(page, handedIn.quiz)).toBeVisible()
  await expect(page.getByRole('row').filter({ hasNotText: handedIn.courseName })).toHaveCount(1) // the header

  await page.goto(`/teach?kind=awaiting_release&course=${handedIn.courseId}`)
  await expect(page.getByText(m.ui_no_matches({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.ui_reset_filters({}, ru) }).click()
  await expect(page).toHaveURL(/\/teach$/)
  await expect(row(page, handedIn.quiz)).toBeVisible()
})

test('B-INB-07 a queue with nothing to react to says so in one sentence', async ({ page, signInAs }) => {
  // e2e-admin authors no course with hand-ins: its teacher queue is empty.
  await signInAs('admin')
  await page.goto('/teach')
  await expect(page.getByText(m.inbox_empty({}, ru))).toBeVisible()
  await expect(page.getByRole('navigation', { name: m.inbox_state({}, ru) })).toHaveCount(0)
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-INB-08 /teach speaks ${locale}`, async ({ page, context, baseURL, signInAs, handedIn }) => {
    await signInAs('teacher')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto('/teach')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1, name: m.platform_nav_inbox({}, { locale }) })).toBeVisible()
    const line = row(page, handedIn.quiz)
    await expect(line).toContainText(m.inbox_kind_needs_grading({}, { locale }))
    await expect(line.getByRole('link', { name: m.inbox_action_grade({}, { locale }) })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(inbox|platform|ui)_[a-z_]+/)
  })
}
