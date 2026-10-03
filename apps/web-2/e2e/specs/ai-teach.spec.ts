import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import type { AdminRun, LectureReview } from '#/shared/api/gen/types.gen'

import { expect as baseExpect, test } from '../fixtures/learning'
import { analysis, caps, json, markNavigation, mockCapabilities, mockRun, RUN, ru } from './ai-fixture'

// The teacher's and the admin's AI (slice 6.3). Model answers are `page.route` fixtures (tag @ai); the admin
// settings and usage are the stand's real ones.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })

test(
  'B-AI-06 B-AI-13 B-AI-14 B-AI-15 the teacher runs the course analysis, reviews and publishes it',
  { tag: '@ai' },
  async ({ page, makeCourse, signInAs }) => {
    const course = await makeCourse()
    await signInAs('teacher')
    let latest: unknown = null
    await page.route(`**/api/v2/ai/course-analysis/${course.id}/latest`, route => json(route, latest))
    const run = await mockRun(page, `course-analysis/${course.id}/analyze/queue`, 'course_analysis')
    const reviewed = Promise.withResolvers<unknown>()
    await page.route('**/api/v2/ai/course-analysis/*/findings/review', route => {
      reviewed.resolve(route.request().postDataJSON())
      return json(route, analysis({ course_id: course.id }))
    })
    await page.route('**/api/v2/ai/course-analysis/*/publish', route =>
      json(route, analysis({ course_id: course.id, status: 'published', stale: false })),
    )
    await page.goto(`/teach/courses/${course.id}/overview`)
    await expect(page.getByText(m.ai_analysis_empty({}, ru))).toBeVisible()
    await page.getByRole('button', { name: m.ai_analyze({}, ru) }).click()
    await expect(page.getByRole('button', { name: m.ai_stop({}, ru) })).toBeVisible()
    expect(await run.queued).toEqual({ language: 'ru' })
    latest = analysis({ course_id: course.id })
    await markNavigation(page)
    run.release()
    await expect(page.getByText(m.ai_score({ score: 74 }, ru))).toBeVisible()
    await expect(page.getByText(m.ai_score_previous({ score: 61 }, ru))).toBeVisible()
    await expect(page.getByText(m.ai_analysis_stale({}, ru))).toBeVisible()
    await expect(page.getByText('Нет проверочных заданий')).toBeVisible()
    await expect(page.getByRole('button', { name: m.ai_reanalyze({}, ru) })).toBeVisible()
    await page.getByRole('button', { name: m.ai_finding_accepted({}, ru) }).click()
    expect(await reviewed.promise).toEqual({ action: 'accepted', finding_id: 'finding-0' })
    await expect(page.getByText(m.ai_finding_saved({}, ru))).toBeVisible()
    await page.getByRole('button', { name: m.ai_publish({}, ru) }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: m.ai_publish({}, ru) })
      .click()
    await expect(page.getByText(m.ai_analysis_published({}, ru)).first()).toBeVisible()
    await expect(page.getByRole('button', { name: m.ai_publish({}, ru) })).toHaveCount(0)
  },
)

const review = (activityId: string, courseId: string, dismissed: string[] = []): LectureReview => ({
  activity_id: activityId,
  course_id: courseId,
  created_at_unix: 1_760_000_000,
  dismissed_suggestion_ids: dismissed,
  id: '0190a5d2-0000-7000-8000-00000000b001',
  language: 'ru',
  run_id: RUN,
  status: 'active',
  suggestions: {
    summary: 'Лекция длинная.',
    suggestions: [
      { suggestion_id: 's1', title: 'Разбить на части', priority: 'medium', location: 'Абзац 2', rationale: 'Длинно' },
      { suggestion_id: 's2', title: 'Добавить пример', replacement_markdown: '**Пример**: цикл for' },
    ],
  },
  superseded_at_unix: null,
  triggered_by: null,
})

test(
  'B-AI-03 B-AI-18 the teacher reviews a lecture in the studio and hides a suggestion',
  { tag: '@ai' },
  async ({ page, makeCourse, signInAs }) => {
    const course = await makeCourse()
    const activityId = course.activityIds[0] ?? ''
    await signInAs('teacher')
    const lecture = { key: 'lecture_authoring_enabled', enabled: true, reason: null }
    await mockCapabilities(
      page,
      caps({ role: 'teacher', surface: 'teacher-studio', modes: ['ask'], features: [lecture] }),
    )
    let reviews = [review(activityId, course.id)]
    await page.route(`**/api/v2/ai/lecture-authoring/${course.id}/reviews`, route => json(route, reviews))
    await page.route('**/api/v2/ai/lecture-authoring/reviews/*/dismiss', route =>
      json(route, review(activityId, course.id, ['s1'])),
    )
    const run = await mockRun(page, `lecture-authoring/${course.id}/critique/queue`, 'lecture_review')
    // The studio's loader reads the scope: a client navigation lets the browser read the fixture.
    await page.goto(`/teach/courses/${course.id}/content`)
    // A link clicked before hydration navigates natively (an SSR load with the real scope): wait for it.
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'Page 1' }).click()
    await expect(page).toHaveURL(new RegExp(`/activities/${activityId}/edit`))
    const aside = page.getByRole('complementary', { name: m.ai_panel_title({}, ru) })
    await aside.getByRole('button', { name: m.ai_tab_critique({}, ru) }).click()
    await expect(aside.getByText('Разбить на части')).toBeVisible()
    await expect(aside.getByText(m.ai_location({ location: 'Абзац 2' }, ru))).toBeVisible()
    await expect(aside.getByText('цикл for')).toBeVisible()
    await aside
      .getByRole('button', { name: m.ai_suggestion_hide({}, ru) })
      .first()
      .click()
    await expect(aside.getByText('Разбить на части')).toHaveCount(0)
    await aside.getByRole('button', { name: m.ai_critique_run({}, ru) }).click()
    expect(await run.queued).toEqual({ activity_id: activityId, language: 'ru' })
    reviews = []
    await markNavigation(page)
    run.release()
    await expect(aside.getByText(m.ai_critique_empty({}, ru))).toBeVisible()
  },
)

const adminRun: AdminRun = {
  completed_at_unix: 1_760_000_010,
  context: {},
  cost_estimate: null,
  duration_ms: 4200,
  error_code: 'AI_RUN_FAILED',
  feature: 'course_qa',
  id: RUN,
  input_tokens: 1200,
  model_name: 'e2e-model',
  output_tokens: 300,
  retry_count: 0,
  started_at_unix: 1_760_000_000,
  status: 'failed',
  stuck: false,
  time_to_first_text_ms: null,
}

async function openAdminAi(page: Page) {
  await page.goto('/admin/users')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('link', { name: m.platform_nav_ai({}, ru) })
    .first()
    .click()
  await expect(page).toHaveURL(/\/admin\/ai/)
}

test(
  'B-AI-20 B-AI-21 B-AI-22 B-AI-23 the admin reads settings, usage, runs with filters, a run and evals',
  { tag: '@ai' },
  async ({ page, signInAs }) => {
    await signInAs('admin')
    const listed: URL[] = []
    await page.route(
      url => url.pathname === '/api/v2/ai/admin/runs',
      route => {
        listed.push(new URL(route.request().url()))
        return json(route, { items: [adminRun], next_cursor: null })
      },
    )
    await page.route(`**/api/v2/ai/admin/runs/${RUN}`, route =>
      json(route, {
        run: adminRun,
        events: [
          {
            id: '0190a5d2-0000-7000-8000-00000000c001',
            sequence: 1,
            event_type: 'queued',
            created_at_unix: 1,
            payload: { state: 'queued' },
          },
          {
            id: '0190a5d2-0000-7000-8000-00000000c002',
            sequence: 2,
            event_type: 'failed',
            created_at_unix: 2,
            payload: { state: 'failed', error_code: 'AI_RUN_FAILED' },
          },
        ],
        artifacts: [],
        evidence: [],
      }),
    )
    await page.route('**/api/v2/ai/admin/evals', route =>
      json(route, {
        runs: { aborted: 0, failed: 1, queued: 0, running: 0, succeeded: 4, total: 5 },
        evals: { average_score: 0.8, failed: 1, passed: 3, total: 4 },
        recent_evals: [
          {
            id: '0190a5d2-0000-7000-8000-00000000c003',
            dataset: 'qa-golden',
            evaluator: 'judge',
            score: 0.9,
            passed: true,
            run_id: null,
            created_at_unix: 1_760_000_000,
            details: {},
          },
        ],
      }),
    )
    await openAdminAi(page)
    await expect(page.getByRole('heading', { level: 1, name: m.ai_admin_title({}, ru) })).toBeVisible()
    await expect(page.getByText(m.ai_enabled({}, ru))).toBeVisible()
    await expect(page.getByText(m.ai_feature_course_qa({}, ru)).first()).toBeVisible()
    await expect(page.getByRole('progressbar', { name: m.ai_budget_used({}, ru) })).toBeVisible()
    await expect(page.getByText(m.ai_evals_total({ count: '4' }, ru))).toBeVisible()
    await expect(page.getByText('qa-golden').first()).toBeVisible()
    await page.getByRole('combobox', { name: m.ai_filter_status({}, ru) }).selectOption('failed')
    await expect(page).toHaveURL(/status=failed/)
    await expect.poll(() => listed.at(-1)?.searchParams.get('status')).toBe('failed')
    await page
      .getByRole('link', { name: m.ai_kind_course_qa({}, ru) })
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`run=${RUN}`))
    const sheet = page.getByRole('dialog', { name: m.ai_open_run({}, ru) })
    await expect(sheet.getByText(m.ai_run_error({ code: 'AI_RUN_FAILED' }, ru))).toBeVisible()
    await expect(sheet.getByText(m.ai_model({ model: 'e2e-model' }, ru))).toBeVisible()
    await expect(sheet.getByRole('heading', { name: m.ai_run_events({}, ru) })).toBeVisible()
  },
)

for (const locale of ['kk', 'en'] as const) {
  test(`B-AI-24 /admin/ai speaks ${locale}`, async ({ page, context, baseURL, signInAs }) => {
    await signInAs('admin')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto('/admin/ai')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1, name: m.ai_admin_title({}, { locale }) })).toBeVisible()
    await expect(page.getByRole('heading', { name: m.ai_admin_runs({}, { locale }) })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(ai|platform|ui|errors)_[a-z_]+/)
  })
}
