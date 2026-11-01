import * as v from 'valibot'
import { m } from '#/paraglide/messages'
import type { CodeRunStatus } from '#/shared/api/gen/types.gen'
import type { MadeCourse } from '../fixtures/learning'
import { expect, region, ru, start, SUM, test, typeCode, type Made } from './code-arena-fixture'

test.describe.configure({ timeout: 90_000 })
const arena = (course: MadeCourse, made: Made) => '/learn/' + course.id + '/' + made.activityId + '/code'

const realVerdicts: { name: string; source: string; language?: number; status: CodeRunStatus; label: () => string }[] =
  [
    {
      name: 'wrong answer',
      source: 'print(0)',
      status: 'wrong_answer',
      label: () => m.code_status_wrong_answer({}, ru),
    },
    {
      name: 'compilation error',
      source: 'int main( {',
      language: 54,
      status: 'compile_error',
      label: () => m.code_status_compile_error({}, ru),
    },
    {
      name: 'time limit',
      source: 'while True: pass',
      status: 'time_limit',
      label: () => m.code_status_time_limit({}, ru),
    },
  ]

for (const verdict of realVerdicts) {
  test(`@runner a real ${verdict.name} is persisted and survives a reload`, async ({
    page,
    learner,
    makeCourse,
    challenges,
  }) => {
    const course = await makeCourse({ activities: 1 })
    const made = await challenges.make(course, {
      body: { ...SUM, languages: [71, 54], starter_code: { ...SUM.starter_code, '54': '' } },
    })
    await learner.enroll(course)
    await learner.signIn()
    await page.goto(arena(course, made))
    await start(page)
    await page.getByLabel(m.code_language({}, ru), { exact: true }).selectOption(String(verdict.language ?? 71))
    await typeCode(page, verdict.source)
    const requested = page.waitForResponse(
      response =>
        response.request().method() === 'POST' && response.url().endsWith(`/assessment-items/${made.itemId}/runs`),
    )
    await page.getByRole('button', { name: m.code_run({}, ru) }).click()
    const response = await requested
    expect(response.ok()).toBe(true)
    const run = v.parse(v.object({ id: v.string() }), await response.json())
    await expect(
      region(page, m.code_run_title({}, ru)).getByText(verdict.label(), { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => {
        const stored = await page.request.get(`/api/v2/code-runs/${run.id}`)
        expect(stored.ok()).toBe(true)
        return v.parse(v.object({ status: v.string() }), await stored.json()).status
      })
      .toBe(verdict.status)
    await page.reload()
    await expect(
      region(page, m.code_run_title({}, ru)).getByText(verdict.label(), { exact: true }).first(),
    ).toBeVisible()
  })
}
