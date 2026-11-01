import { m } from '#/paraglide/messages'
import { getActivity, updateActivity } from '#/shared/api/gen/sdk.gen'
import type { ActivityContent } from '#/shared/api/gen/types.gen'
import { expect, test } from '../fixtures/learning'

const ru = { locale: 'ru' } as const
const TEXT = 'Текст богатой страницы'
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const cell = (type: string, text: string) => ({ type, content: [paragraph(text)] })
const RICH: ActivityContent = {
  type: 'doc',
  content: [
    paragraph(TEXT),
    { type: 'blockMathEquation', attrs: { math_equation: 'x^2 + y^2 = z^2' } },
    { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: 'print(1)' }] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Термин'), cell('tableHeader', 'Смысл')] },
        { type: 'tableRow', content: [cell('tableCell', 'Атом'), cell('tableCell', 'Частица')] },
      ],
    },
    { type: 'flipcard', attrs: { question: 'Что такое атом?', answer: 'Частица вещества.' } },
    { type: 'calloutInfo', content: [paragraph('Запомните.')] },
  ],
}

test('B-EDT-34 a lesson page with formulas, code, a table and a flip card loads no editor code', async ({
  page,
  api,
  seed,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  const { name, value } = seed.accounts.teacher.cookie
  const headers = { cookie: `${name}=${value}` }
  const path = { activity_id: course.activityIds[0] ?? '' }
  const { data: activity } = await getActivity({ client: api, path, headers, throwOnError: true })
  await updateActivity({
    client: api,
    path,
    body: { content: RICH },
    headers: { ...headers, 'If-Match': activity.version },
    throwOnError: true,
  })
  await learner.enroll(course)
  await learner.signIn()
  // A string only ProseMirror's view carries (the editor chunk in a build, prosemirror-view under `vp dev`).
  const scripts: Promise<string>[] = []
  page.on('response', response => {
    if (response.request().resourceType() === 'script') scripts.push(response.text().catch(() => ''))
  })
  await page.goto(`/learn/${course.id}/${course.activityIds[0]}`)

  await expect(page.getByText(TEXT)).toBeVisible()
  await expect(page.locator('.katex').first()).toBeVisible() // KaTeX and shiki load lazily: wait for both
  await expect(page.locator('pre span[style]').first()).toBeAttached()
  await expect(page.getByRole('cell', { name: 'Частица' })).toBeVisible()
  await page.getByRole('button', { name: m.editor_flipcard_show_answer({}, ru) }).click()
  await expect(page.getByText('Частица вещества.')).toBeVisible()
  await expect(page.locator('[contenteditable], .ProseMirror')).toHaveCount(0)
  const bodies = await Promise.all(scripts)
  expect(bodies.length).toBeGreaterThan(0)
  expect(bodies.filter(body => body.includes('ProseMirror-trailingBreak'))).toHaveLength(0)
})
