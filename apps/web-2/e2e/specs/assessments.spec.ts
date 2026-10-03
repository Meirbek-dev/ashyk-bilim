import { m } from '#/paraglide/messages'
import { getActivityAssessment, lifecycle } from '#/shared/api/gen/sdk.gen'
import type { CreateItemRequest } from '#/shared/api/gen/types.gen'

import { makeAssessment, readyChoice, studioUrl } from './assessments-fixture'
import { expect, ru, test } from './course-studio-fixture'

// The question builder of quizzes, exams and code challenges (slice 5.1): `edit` of the activity studio.

test.beforeEach(async ({ signInAs }) => signInAs('teacher'))

const saved = (page: import('@playwright/test').Page) =>
  expect(page.getByText(m.studio_save_saved({}, ru), { exact: true })).toBeVisible({ timeout: 10_000 })

test('B-ASM-01 B-ASM-02 B-ASM-03 B-ASM-04 B-ASM-05 B-ASM-10 a new choice question is added, edited and autosaved', async ({
  page,
  studio,
  seed,
}) => {
  const { courseId, assessment, headers } = await makeAssessment(studio, seed)
  await page.goto(studioUrl(courseId, assessment.activity_id))
  await expect(page.getByText(m.assessments_items_empty({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.assessments_item_add({}, ru) }).click()
  await page.getByRole('menuitem', { name: m.assessments_kind_single_choice({}, ru) }).click()
  await expect(page).toHaveURL(/\?item=/)
  await expect(
    page.getByRole('heading', { name: `1. ${m.assessments_item_new_title({ number: 1 }, ru)}` }),
  ).toBeVisible()
  await page.getByLabel(m.assessments_field_title({}, ru)).fill('Столица')
  await page.getByRole('textbox', { name: m.assessments_field_prompt({}, ru) }).fill('Столица Казахстана?')
  await page.getByRole('textbox', { name: m.assessments_option_text({ number: 1 }, ru), exact: true }).fill('Астана')
  await page.getByRole('textbox', { name: m.assessments_option_text({ number: 2 }, ru), exact: true }).fill('Алматы')
  await page.getByRole('radio', { name: m.assessments_option_correct({ number: 1 }, ru) }).click()
  await saved(page)
  const read = async () =>
    (await getActivityAssessment({ client: studio.api, path: { activity_id: assessment.activity_id }, headers })).data
  await expect.poll(async () => (await read())?.items[0]?.title).toBe('Столица')
  const body = (await read())?.items[0]?.body
  expect(body?.kind === 'choice' && body.options?.map(option => [option.text, option.is_correct])).toEqual([
    ['Астана', true],
    ['Алматы', false],
  ])
  await expect(page.getByText(m.assessments_items_summary({ count: '1', points: '1' }, ru))).toBeVisible()
  // Out of the contract's range: shown under the field, not sent.
  await page.getByLabel(m.assessments_field_points({}, ru)).fill('20000')
  await expect(page.getByText(m.validation_invalid({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_save_dirty({}, ru), { exact: true })).toBeVisible()
  await page.getByLabel(m.assessments_field_points({}, ru)).fill('2')
  await saved(page)
  await page.reload()
  await expect(page.getByLabel(m.assessments_field_title({}, ru))).toHaveValue('Столица')
  await expect(page.getByLabel(m.assessments_field_points({}, ru))).toHaveValue('2')
})

test('B-ASM-06 B-ASM-07 B-ASM-08 matching, open answer and form questions save their parts', async ({
  page,
  studio,
  seed,
}) => {
  const items: CreateItemRequest[] = [
    { title: 'Пары', body: { kind: 'matching', prompt: 'p', explanation: null, pairs: [{ left: '', right: '' }] } },
    { title: 'Эссе', body: { kind: 'open_text', prompt: 'p', min_words: null, rubric: null } },
    { title: 'Анкета', body: { kind: 'form', prompt: 'p', fields: [{ id: 'f1', label: '', field_type: 'text' }] } },
  ]
  const { courseId, assessment, headers } = await makeAssessment(studio, seed, { items })
  await page.goto(studioUrl(courseId, assessment.activity_id))
  await page.getByLabel(m.assessments_pair_left({ number: 1 }, ru)).fill('Кошка')
  await page.getByLabel(m.assessments_pair_right({ number: 1 }, ru)).fill('Мяу')
  await page.getByRole('button', { name: m.assessments_pair_add({}, ru) }).click()
  await page.getByLabel(m.assessments_pair_left({ number: 2 }, ru)).fill('Собака')
  await page.getByLabel(m.assessments_pair_right({ number: 2 }, ru)).fill('Гав')
  await saved(page)
  await page.getByRole('link', { name: '2. Эссе' }).click()
  await page.getByLabel(m.assessments_field_min_words({}, ru)).fill('150')
  await saved(page)
  await page.getByRole('link', { name: '3. Анкета' }).click()
  await page.getByLabel(m.assessments_form_field_label({ number: 1 }, ru)).fill('Имя')
  await page.getByRole('button', { name: m.assessments_form_field_add({}, ru) }).click()
  await page.getByLabel(m.assessments_form_field_label({ number: 2 }, ru)).fill('Дата рождения')
  await page.getByLabel(m.assessments_form_field_type({ number: 2 }, ru)).selectOption('date')
  await saved(page)
  const read = async () => {
    const path = { activity_id: assessment.activity_id }
    const { data } = await getActivityAssessment({ client: studio.api, path, headers, throwOnError: true })
    return data.items.map(item => item.body)
  }
  await expect.poll(async () => JSON.stringify(await read())).toContain('Дата рождения')
  const [matching, essay, form] = await read()
  expect(matching?.kind === 'matching' && 'pairs' in matching && matching.pairs).toEqual([
    { left: 'Кошка', right: 'Мяу' },
    { left: 'Собака', right: 'Гав' },
  ])
  expect(essay?.kind === 'open_text' && essay.min_words).toBe(150)
  expect(form?.kind === 'form' && form.fields?.map(field => [field.label, field.field_type])).toEqual([
    ['Имя', 'text'],
    ['Дата рождения', 'date'],
  ])
})

test('B-ASM-12 B-ASM-13 B-ASM-14 questions are duplicated, deleted and reordered by keyboard', async ({
  page,
  studio,
  seed,
}) => {
  const items = ['Альфа', 'Бета', 'Гамма'].map(readyChoice)
  const { courseId, assessment, headers } = await makeAssessment(studio, seed, { items })
  await page.goto(studioUrl(courseId, assessment.activity_id))
  await page.getByRole('button', { name: m.assessments_item_duplicate({}, ru) }).click()
  await expect(page.getByText(m.assessments_item_duplicated({}, ru))).toBeVisible()
  await expect(page.getByRole('heading', { name: '4. Альфа (копия)' })).toBeVisible()
  await page.getByRole('button', { name: m.assessments_item_delete({}, ru) }).click()
  const confirm = page.getByRole('alertdialog', {
    name: m.assessments_item_delete_title({ title: 'Альфа (копия)' }, ru),
  })
  await confirm.getByRole('button', { name: m.assessments_delete({}, ru) }).click()
  await expect(page.getByText(m.assessments_item_deleted({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: /Альфа \(копия\)/ })).toHaveCount(0)
  const handle = page.getByRole('button', { name: m.assessments_item_drag({ title: 'Гамма' }, ru) })
  await handle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  const order = async () =>
    (
      await getActivityAssessment({ client: studio.api, path: { activity_id: assessment.activity_id }, headers })
    ).data?.items.map(item => item.title)
  await expect.poll(order).toEqual(['Гамма', 'Альфа', 'Бета'])
  await page.reload()
  await expect(page.getByRole('link', { name: '1. Гамма' })).toBeVisible()
})

test('B-ASM-09 a code challenge is edited by the code arena, not the question builder', async ({
  page,
  studio,
  seed,
}) => {
  const { courseId, assessment } = await makeAssessment(studio, seed, { kind: 'code_challenge', title: 'Код' })
  await page.goto(studioUrl(courseId, assessment.activity_id))
  await expect(page.getByRole('heading', { name: m.code_studio_title({}, ru) })).toBeVisible()
  await expect(page.getByRole('button', { name: m.assessments_item_add({}, ru) })).toHaveCount(0)
})

test('B-ASM-11 a save the server refuses (scheduled) shows why and keeps the input', async ({ page, studio, seed }) => {
  const { courseId, assessment, headers } = await makeAssessment(studio, seed, { items: [readyChoice('Готов')] })
  const body = { to: 'scheduled' as const, scheduled_at_unix: Math.floor(Date.now() / 1000) + 86_400 }
  const path = { assessment_id: assessment.id }
  await lifecycle({ client: studio.api, path, body, headers, throwOnError: true })
  await page.goto(studioUrl(courseId, assessment.activity_id))
  await page.getByLabel(m.assessments_field_title({}, ru)).fill('Новое название')
  await expect(page.getByText(m.errors_assessment_read_only({}, ru))).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(m.studio_save_failed({}, ru), { exact: true })).toBeVisible()
  await expect(page.getByLabel(m.assessments_field_title({}, ru))).toHaveValue('Новое название')
})
