import type { Page } from '@playwright/test'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { QaMessage, RemediationSession, RunArtifact } from '#/shared/api/gen/types.gen'
import { vQaChatRequest } from '#/shared/api/gen/valibot.gen'

import { expect as baseExpect, type MadeCourse, test } from '../fixtures/learning'
import { caps, fulfillSse, json, mockCapabilities, mockRun, problem, RUN, ru, runStatus, THREAD } from './ai-fixture'

// The learner's AI (slice 6.3) with every model answer replaced by `page.route` (tag @ai: these would need the live
// provider otherwise). The player's loader prefetches the scope on the server, so the tests reach a player page by a
// client navigation ("Next") for the browser to read the mocked scope.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })

const panel = (page: Page) => page.getByRole('complementary', { name: m.ai_panel_title({}, ru) })

async function openSecondActivity(page: Page, course: MadeCourse) {
  await page.goto(`/learn/${course.id}/${course.activityIds[0]}`)
  // A link clicked before hydration navigates natively (an SSR load with the real scope): wait for it.
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('navigation', { name: m.player_neighbours({}, ru) })
    .getByRole('link', { name: m.player_next({}, ru) })
    .click()
  await expect(page).toHaveURL(new RegExp(`/learn/${course.id}/${course.activityIds[1]}`))
}

const studyArtifact: RunArtifact = {
  kind: 'study_companion',
  content: {
    mode: 'practice',
    answer_markdown: '**Цикл** повторяет блок кода.',
    practice_items: [{ prompt: 'Сколько раз выполнится цикл?', answer: 'Три раза' }],
    flashcards: [{ front: 'for', back: 'цикл со счётчиком' }],
    follow_up_suggestions: ['А что такое while?'],
    citations: [{ citation_id: 'c1', label: 'Страница 2', source_type: 'activity' }],
  },
  created_at_unix: 1_760_000_000,
  final: true,
  id: '0190a5d2-0000-7000-8000-00000000a010',
}

test(
  'B-AI-01 B-AI-02 a guest sees no AI on the course page; a learner opens it from there',
  { tag: '@ai' },
  async ({ page, learner, makeCourse }) => {
    const course = await makeCourse()
    await page.goto(`/courses/${course.id}/about`)
    await expect(page.getByRole('heading', { level: 1, name: course.name })).toBeVisible()
    await expect(page.getByRole('button', { name: m.ai_open_panel({}, ru) })).toHaveCount(0)
    await learner.signIn()
    await mockCapabilities(page, caps({ surface: 'course-page', modes: [], available: false, reason: 'ai_disabled' }))
    await page.goto(`/courses/${course.id}/about`)
    await page.getByRole('button', { name: m.ai_open_panel({}, ru) }).click()
    await expect(page).toHaveURL(/[?&]ai=chat/)
    // B-AI-02 an unavailable scope: one line, no question box.
    await expect(page.getByText(m.ai_unavailable_disabled({}, ru))).toBeVisible()
    await expect(page.getByRole('textbox', { name: m.ai_question({}, ru) })).toHaveCount(0)
  },
)

test(
  'B-AI-03 B-AI-04 B-AI-05 B-AI-06 a learner asks the study companion in the player',
  { tag: '@ai' },
  async ({ page, learner, makeCourse }) => {
    const course = await makeCourse()
    await learner.enroll(course)
    await learner.signIn()
    await mockCapabilities(page, caps())
    await page.route('**/api/v2/ai/remediation/student/**', route => json(route, []))
    const run = await mockRun(page, `study/${course.id}/ask/queue`, 'study_companion', [studyArtifact])
    await openSecondActivity(page, course)
    const aside = panel(page)
    await aside.getByRole('button', { name: m.ai_tab_study({}, ru) }).click()
    await expect(page).toHaveURL(/[?&]ai=study/)
    const ask = aside.getByRole('button', { name: m.ai_ask({}, ru) })
    await expect(ask).toBeDisabled()
    await aside.getByRole('button', { name: m.ai_mode_practice({}, ru) }).click()
    await aside.getByRole('textbox', { name: m.ai_question({}, ru) }).fill('Что такое цикл?')
    await ask.click()
    await expect(aside.getByRole('button', { name: m.ai_stop({}, ru) })).toBeVisible()
    expect(await run.queued).toMatchObject({ question: 'Что такое цикл?', mode: 'practice', language: 'ru' })
    run.release()
    await expect(aside.getByText('повторяет блок кода.')).toBeVisible()
    await aside.getByRole('button', { name: m.ai_show_answer({}, ru) }).click()
    await expect(aside.getByText('Три раза')).toBeVisible()
    await expect(aside.getByText('цикл со счётчиком')).toBeVisible()
    await expect(aside.getByText('Страница 2')).toBeVisible()
    await expect(aside.getByRole('button', { name: 'А что такое while?' })).toBeVisible()
  },
)

test(
  'B-AI-07 B-AI-08 "Stop" cancels the run; a refused queue shows its code with "Retry"',
  { tag: '@ai' },
  async ({ page, learner, makeCourse }) => {
    const course = await makeCourse()
    await learner.enroll(course)
    await learner.signIn()
    await mockCapabilities(page, caps())
    await page.route('**/api/v2/ai/remediation/student/**', route => json(route, []))
    let refuse = false
    const cancelled = Promise.withResolvers<null>()
    await page.route(`**/api/v2/ai/study/${course.id}/ask/queue`, route =>
      refuse ? json(route, problem(429, 'ai-rate-limited'), 429) : json(route, runStatus('study_companion'), 202),
    )
    await page.route(`**/api/v2/ai/runs/${RUN}/cancel`, route => {
      cancelled.resolve(null)
      return json(route, { ...runStatus('study_companion'), status: 'aborted' })
    })
    await page.route(`**/api/v2/ai/runs/${RUN}/stream`, async route => {
      await cancelled.promise
      return fulfillSse(route, [{ data: { type: 'RUN_ERROR', message: 'AI run was cancelled', code: 'CANCELLED' } }])
    })
    await openSecondActivity(page, course)
    const aside = panel(page)
    await aside.getByRole('button', { name: m.ai_tab_study({}, ru) }).click()
    await aside.getByRole('textbox', { name: m.ai_question({}, ru) }).fill('Вопрос')
    await aside.getByRole('button', { name: m.ai_ask({}, ru) }).click()
    await aside.getByRole('button', { name: m.ai_stop({}, ru) }).click()
    await expect(aside.getByText(m.errors_ai_run_cancelled({}, ru))).toBeVisible()
    refuse = true
    await aside.getByRole('button', { name: m.ui_retry({}, ru) }).click()
    await expect(aside.getByText(m.errors_ai_rate_limited({}, ru))).toBeVisible()
    await expect(aside.getByRole('button', { name: m.ui_retry({}, ru) })).toBeVisible()
  },
)

const saved = (clientTurnId: string, courseId: string): QaMessage[] =>
  (['user', 'assistant'] as const).map((role, index) => ({
    id: `0190a5d2-0000-7000-8000-00000000a02${index}`,
    role,
    content: role === 'user' ? 'Что такое цикл?' : 'Цикл повторяет блок кода.',
    client_turn_id: clientTurnId,
    citations: { citations: [] },
    confidence: null,
    course_id: courseId,
    created_at_unix: 1_760_000_000,
    metadata: {},
    thread_id: THREAD,
    user_id: null,
  }))

test(
  'B-AI-08 B-AI-09 B-AI-10 B-AI-11 B-AI-12 course Q&A streams, retries the same turn, keeps the thread in the URL',
  { tag: '@ai' },
  async ({ page, learner, makeCourse }) => {
    const course = await makeCourse()
    await learner.enroll(course)
    await learner.signIn()
    await mockCapabilities(page, caps({ surface: 'course-page' }))
    const turns: string[] = []
    let threads: unknown[] = []
    await page.route(`**/api/v2/ai/qa/${course.id}/threads?**`, route => json(route, threads))
    await page.route(`**/api/v2/ai/qa/${course.id}/threads`, route => json(route, threads))
    await page.route(`**/api/v2/ai/qa/${course.id}/threads/${THREAD}`, route =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 204 })
        : json(route, saved(turns[0] ?? '', course.id)),
    )
    await page.route(`**/api/v2/ai/qa/${course.id}/chat`, route => {
      const body = v.parse(vQaChatRequest, route.request().postDataJSON())
      turns.push(body.forwardedProps?.client_turn_id ?? '')
      if (turns.length === 1)
        return fulfillSse(route, [
          { data: { type: 'RUN_STARTED', threadId: THREAD, runId: 'r0' } },
          { data: { type: 'RUN_ERROR', message: 'budget', code: 'ai-budget-exhausted' } },
        ])
      threads = [
        { id: THREAD, title: 'Циклы', last_message_preview: 'Цикл', message_count: 2, updated_at_unix: 1_760_000_000 },
      ]
      const citations = JSON.stringify({
        citations: [{ citation_id: 'c1', label: 'Страница 1', source_type: 'activity' }],
      })
      return fulfillSse(route, [
        { data: { type: 'RUN_STARTED', threadId: THREAD, runId: 'r1' } },
        { data: { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' } },
        { data: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Цикл повторяет ' } },
        { data: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'блок кода.' } },
        { data: { type: 'TEXT_MESSAGE_END', messageId: 'm1' } },
        {
          data: { type: 'TOOL_CALL_START', toolCallId: 't1', toolCallName: 'course_citations', parentMessageId: 'm1' },
        },
        { data: { type: 'TOOL_CALL_RESULT', messageId: 'm2', toolCallId: 't1', content: citations } },
        { data: { type: 'TOOL_CALL_END', toolCallId: 't1' } },
        { data: { type: 'RUN_FINISHED', threadId: THREAD, runId: 'r1', result: { thread_id: THREAD } } },
      ])
    })
    await page.goto(`/courses/${course.id}/about?ai=chat`)
    const sheet = page.getByRole('dialog', { name: m.ai_panel_title({}, ru) })
    await expect(sheet.getByText(m.ai_threads_empty({}, ru))).toBeVisible()
    await sheet.getByRole('textbox', { name: m.ai_question({}, ru) }).fill('Что такое цикл?')
    await sheet.getByRole('button', { name: m.ai_ask({}, ru) }).click()
    await expect(sheet.getByText(m.errors_ai_budget_exhausted({}, ru))).toBeVisible()
    await expect(sheet.getByText('Что такое цикл?')).toBeVisible()
    await sheet.getByRole('button', { name: m.ui_retry({}, ru) }).click()
    await expect(sheet.getByText('Цикл повторяет блок кода.')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`aiThread=${THREAD}`))
    expect(turns).toHaveLength(2)
    expect(turns[1]).toBe(turns[0])
    await expect(sheet.getByRole('button', { name: /Циклы/ })).toHaveAttribute('aria-current', 'true')
    await sheet.getByRole('button', { name: m.ai_delete_thread({}, ru) }).click()
    await expect(page.getByRole('alertdialog')).toContainText('Циклы')
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: m.ai_delete_thread({}, ru) })
      .click()
    await expect(sheet.getByText(m.ai_threads_empty({}, ru))).toBeVisible()
    await expect(page).not.toHaveURL(/aiThread=/)
  },
)

const session = (activityId: string): RemediationSession => ({
  activity_id: activityId,
  analysis_id: null,
  created_at_unix: 1_760_000_000,
  file_submission_attempt_id: null,
  gate_mode: true,
  id: '0190a5d2-0000-7000-8000-00000000a030',
  language: 'ru',
  lecture: {
    title: 'Повторим циклы',
    micro_lecture_markdown: 'Цикл выполняет тело, пока условие истинно.',
    learning_objectives: ['Отличать for и while'],
    practice_questions: [],
  },
  passed_at_unix: null,
  run_id: null,
  score: null,
  status: 'assigned',
  student_user_id: '0190a5d2-0000-7000-8000-00000000a031',
  submission_id: null,
  test: { questions: [{ prompt: 'Когда цикл while останавливается?', answer: 'Когда условие ложно' }] },
  updated_at_unix: 1_760_000_000,
})

test(
  'B-AI-19 the learner works through a remediation session and posts the score',
  { tag: '@ai' },
  async ({ page, learner, makeCourse }) => {
    const course = await makeCourse()
    await learner.enroll(course)
    await learner.signIn()
    const activityId = course.activityIds[1] ?? ''
    await mockCapabilities(page, caps())
    await page.route('**/api/v2/ai/remediation/student/**', route => json(route, [session(activityId)]))
    const posted = Promise.withResolvers<unknown>()
    await page.route('**/api/v2/ai/remediation/sessions/*/complete', route => {
      posted.resolve(route.request().postDataJSON())
      return json(route, { ...session(activityId), status: 'passed', score: 100, passed_at_unix: 1_760_000_100 })
    })
    await openSecondActivity(page, course)
    const aside = panel(page)
    await aside.getByRole('button', { name: m.ai_tab_remediation({}, ru) }).click()
    await expect(aside.getByText('Цикл выполняет тело, пока условие истинно.')).toBeVisible()
    await expect(aside.getByText('Отличать for и while')).toBeVisible()
    const finish = aside.getByRole('button', { name: m.ai_remediation_complete({}, ru) })
    await expect(finish).toBeDisabled()
    await aside.getByRole('button', { name: m.ai_show_answer({}, ru) }).click()
    await aside.getByRole('checkbox', { name: m.ai_got_it({}, ru) }).click()
    await finish.click()
    expect(await posted.promise).toEqual({ score: 100 })
    await expect(aside.getByText(m.ai_remediation_result_passed({ score: 100 }, ru))).toBeVisible()
  },
)
