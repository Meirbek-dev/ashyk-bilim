import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'

import { expect, gradedAttempt, openFromPlayer, routeLanguages, ru, runOf, test } from './code-arena-fixture'

// The learner's own runs and the run a grade came from (L-6: `GET /assessment-items/{id}/runs`). The API is routed:
// a judged run needs Judge0, which the local stand may not have.
test.describe.configure({ timeout: 60_000 })

const region = (page: Page, name: string) => page.getByRole('region', { name })

test('B-COD-21 B-COD-22 the own runs open their verdicts; a graded attempt shows the run it was graded on', async ({
  page,
  learner,
  makeCourse,
  challenges,
}) => {
  const course = await makeCourse({ activities: 1 })
  const made = await challenges.make(course)
  await learner.enroll(course)
  await learner.signIn()
  await routeLanguages(page)
  const graded = gradedAttempt(made, randomUUID())
  const visible = runOf(made, randomUUID())
  const final = {
    ...runOf(made, randomUUID()),
    purpose: 'final' as const,
    submission_id: graded.id,
    status: 'accepted' as const,
    passed: 2,
  }
  await page.route(`**/api/v2/assessments/${made.assessment.id}/submissions/me`, route =>
    route.fulfill({ json: [graded] }),
  )
  await page.route(
    url => url.pathname.endsWith(`/assessment-items/${made.itemId}/runs`),
    route => {
      const purpose = new URL(route.request().url()).searchParams.get('purpose')
      return route.fulfill({ json: purpose === 'final' ? [final] : purpose === 'visible' ? [visible] : [] })
    },
  )
  await page.route(`**/api/v2/code-runs/${visible.id}`, route => route.fulfill({ json: visible }))
  await openFromPlayer(page, course, made)

  const runs = region(page, m.code_runs({}, ru))
  await expect(runs.getByText(m.code_status_wrong_answer({}, ru))).toBeVisible()
  await expect(runs.getByText(m.code_run_passed({ passed: 1, total: 2 }, ru))).toBeVisible()
  await runs.getByRole('link', { name: m.code_run_results({}, ru) }).click()
  await expect(page).toHaveURL(new RegExp(`[?&]run=${visible.id}`))
  const result = region(page, m.code_run_title({}, ru))
  await expect(result.getByText(m.code_status_runtime_error({}, ru))).toBeVisible()
  await expect(result.getByText(m.code_io_actual({}, ru))).toHaveCount(2)

  const history = region(page, m.code_history({}, ru))
  await history.getByRole('link', { name: m.code_attempt_code({ number: 1 }, ru) }).click()
  const gradedRun = region(page, m.code_final_run_title({}, ru))
  await expect(gradedRun.getByText(m.code_run_passed({ passed: 2, total: 2 }, ru))).toBeVisible()
  await expect(gradedRun.getByText(m.code_status_accepted({}, ru)).first()).toBeVisible()
})
