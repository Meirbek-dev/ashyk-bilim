import { randomUUID } from 'node:crypto'

import type { Locator } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import {
  courseLifecycle,
  createActivity,
  createChapter,
  createCourse,
  createDiscussion,
  deleteCourse,
  updateActivity,
} from '#/shared/api/gen/sdk.gen'
import type { Course, Discussion, DiscussionId } from '#/shared/api/gen/types.gen'

import { expect, type Seed, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
type Author = 'teacher' | 'student'

const cookie = (seed: Seed, role: Author) => {
  const { name, value } = seed.accounts[role].cookie
  return { cookie: `${name}=${value}` }
}

/** A post's stored content: the editor document as a JSON string, the way the composer sends it. */
const doc = (text: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

// Each test gets its own published course of the teacher; posts are made through the SDK as either account.
const test = base.extend<{
  api: ReturnType<typeof createClient>
  course: () => Promise<Course>
  post: (course: Course, text: string, author?: Author, parent?: DiscussionId) => Promise<Discussion>
}>({
  api: async ({ baseURL }, use) => use(createClient(createConfig({ baseUrl: String(baseURL) }))),
  course: async ({ api, seed }, use) => {
    const made: string[] = []
    const headers = cookie(seed, 'teacher')
    await use(async () => {
      const name = `E2E discussions ${randomUUID().slice(0, 8)}`
      const { data: course } = await createCourse({ client: api, body: { name }, headers, throwOnError: true })
      made.push(course.id)
      const path = { course_id: course.id }
      const chapter = await createChapter({ client: api, path, body: { name: 'Глава' }, headers, throwOnError: true })
      const activity = await createActivity({
        client: api,
        path: { chapter_id: chapter.data.id },
        body: { name: 'Страница', activity_type: 'dynamic', activity_sub_type: 'dynamic_page' },
        headers,
      })
      const id = activity.data?.id ?? ''
      await updateActivity({
        client: api,
        path: { activity_id: id },
        body: { published: true },
        headers,
        throwOnError: true,
      })
      await courseLifecycle({ client: api, path, body: { action: 'publish' }, headers, throwOnError: true })
      return course
    })
    for (const id of made) await deleteCourse({ client: api, path: { course_id: id }, headers })
  },
  post: async ({ api, seed }, use) =>
    use(async (course, text, author = 'student', parent) => {
      const { data } = await createDiscussion({
        client: api,
        path: { course_id: course.id },
        body: { content: doc(text), parent_id: parent },
        headers: cookie(seed, author),
        throwOnError: true,
      })
      return data
    }),
})

const tab = (course: Course, thread?: string) => `/courses/${course.id}/discussions${thread ? `?thread=${thread}` : ''}`

// A click that lands before hydration (SSR page) does nothing: retry until it acts.
async function clickUntil(target: Locator, outcome: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await target.click({ timeout: 1000 })
    await outcome()
  }).toPass()
}

const article = (page: import('@playwright/test').Page, text: string) =>
  page.locator('article').filter({ hasText: text })

test('B-DSC-01 a guest is invited to sign in and come back', async ({ page, course }) => {
  const made = await course()
  await page.goto(tab(made))
  await expect(page.getByText(m.discussions_guest({}, ru))).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: m.platform_nav_login({}, ru) })).toHaveAttribute(
    'href',
    `/login?redirect=${encodeURIComponent(tab(made))}`,
  )
})

test('B-DSC-02 posts come newest first, twenty at a time, then "Show more"', async ({
  page,
  signInAs,
  course,
  post,
}) => {
  const made = await course()
  const empty = await course()
  for (let index = 1; index <= 21; index += 1) await post(made, `Пост номер ${index}.`)
  await signInAs('student')
  await page.goto(tab(empty))
  await expect(page.getByText(m.discussions_empty({}, ru))).toBeVisible()
  await page.goto(tab(made))
  await expect(page.locator('main article')).toHaveCount(20)
  await expect(page.locator('main article').first()).toContainText('Пост номер 21.')
  const more = page.getByRole('button', { name: m.ui_show_more({}, ru) })
  await clickUntil(more, () => expect(page.locator('main article')).toHaveCount(21, { timeout: 2000 }))
  await expect(page.locator('main article').last()).toContainText('Пост номер 1.')
  await expect(more).toHaveCount(0)
})

test('B-DSC-03 a post needs text, carries an Idempotency-Key and lands first', async ({
  page,
  signInAs,
  course,
  post,
}) => {
  const made = await course()
  await post(made, 'Старый пост.')
  await signInAs('student')
  await page.goto(tab(made))
  const composer = page.getByRole('region', { name: m.discussions_new({}, ru) })
  const publish = composer.getByRole('button', { name: m.discussions_publish({}, ru) })
  await clickUntil(publish, () =>
    expect(composer.getByText(m.discussions_text_required({}, ru))).toBeVisible({ timeout: 1000 }),
  )
  const text = `Новый вопрос ${randomUUID().slice(0, 8)}`
  await composer.getByRole('textbox').fill(text)
  const request = page.waitForRequest(sent => sent.method() === 'POST' && sent.url().endsWith('/discussions'))
  await publish.click()
  expect((await request).headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByText(m.discussions_published({}, ru))).toBeVisible()
  await expect(page.locator('main article').first()).toContainText(text)
  await expect(composer.getByRole('textbox')).toHaveText('')
})

test('B-DSC-04 a thread opens under its post and lives in the URL', async ({ page, signInAs, course, post }) => {
  const made = await course()
  const question = await post(made, 'Вопрос с ответами.')
  await post(made, 'Первый ответ.', 'teacher', question.id)
  await post(made, 'Второй ответ.', 'teacher', question.id)
  await signInAs('student')
  await page.goto(tab(made))
  await clickUntil(page.getByRole('link', { name: m.discussions_replies({ count: 2 }, ru) }), () =>
    expect(page).toHaveURL(new RegExp(`\\?thread=${question.id}$`), { timeout: 1000 }),
  )
  await expect(article(page, 'Первый ответ.')).toBeVisible()
  await page.reload()
  await expect(article(page, 'Второй ответ.')).toBeVisible()
  await expect(page.locator('main article').filter({ hasText: 'ответ.' }).last()).toContainText('Второй ответ.')
  await clickUntil(page.getByRole('link', { name: m.discussions_hide_replies({}, ru) }), () =>
    expect(page).toHaveURL(/\/discussions$/, { timeout: 1000 }),
  )
  await expect(article(page, 'Первый ответ.')).toHaveCount(0)
})

test('B-DSC-05 a reply goes to the end of the open thread', async ({ page, signInAs, course, post }) => {
  const made = await course()
  const question = await post(made, 'Вопрос без ответа.', 'teacher')
  await post(made, 'Уже есть ответ.', 'teacher', question.id)
  await signInAs('student')
  await page.goto(tab(made, question.id))
  // The thread is named after its reply count, which grows with the reply.
  const thread = page.getByRole('region', { name: /\(\d+\)$/ })
  const text = `Мой ответ ${randomUUID().slice(0, 8)}`
  await expect(thread.getByRole('textbox')).toBeVisible()
  await thread.getByRole('textbox').fill(text)
  await thread.getByRole('button', { name: m.discussions_reply({}, ru) }).click()
  await expect(page.getByText(m.discussions_replied({}, ru))).toBeVisible()
  await expect(thread.locator('article').last()).toContainText(text)
})

test('B-DSC-06 the author edits a post in place', async ({ page, signInAs, course, post }) => {
  const made = await course()
  await post(made, 'Черновой текст.')
  await signInAs('student')
  await page.goto(tab(made))
  const item = article(page, 'Черновой текст.')
  await clickUntil(item.getByRole('button', { name: m.discussions_edit({}, ru) }), () =>
    expect(item.getByRole('textbox')).toHaveText('Черновой текст.', { timeout: 2000 }),
  )
  await item.getByRole('button', { name: m.ui_cancel({}, ru) }).click()
  await expect(item.getByRole('textbox')).toHaveCount(0)
  await item.getByRole('button', { name: m.discussions_edit({}, ru) }).click()
  await item.getByRole('textbox').fill('Исправленный текст.')
  // The old text is gone from the article now: the one Save on the page is this form's.
  await page.getByRole('button', { name: m.ui_save({}, ru) }).click()
  await expect(page.getByText(m.discussions_saved({}, ru))).toBeVisible()
  await expect(article(page, 'Исправленный текст.')).toBeVisible()
})

test('B-DSC-07 deleting asks first, then the post is gone', async ({ page, signInAs, course, post }) => {
  const made = await course()
  await post(made, 'Удаляемый пост.')
  await signInAs('student')
  await page.goto(tab(made))
  const confirm = page.getByRole('alertdialog', { name: m.discussions_delete_post_title({}, ru) })
  await clickUntil(article(page, 'Удаляемый пост.').getByRole('button', { name: m.discussions_delete({}, ru) }), () =>
    expect(confirm).toBeVisible({ timeout: 1000 }),
  )
  await expect(confirm).toContainText(m.discussions_delete_post_consequence({}, ru))
  await confirm.getByRole('button', { name: m.discussions_delete({}, ru) }).click()
  await expect(page.getByText(m.discussions_deleted({}, ru))).toBeVisible()
  await expect(article(page, 'Удаляемый пост.')).toHaveCount(0)
})

test('B-DSC-08 the course author hides and restores a post; its owner cannot', async ({
  page,
  signInAs,
  course,
  post,
}) => {
  const made = await course()
  await post(made, 'Спорный пост.')
  await signInAs('student')
  await page.goto(tab(made))
  await expect(article(page, 'Спорный пост.').getByRole('button', { name: m.discussions_edit({}, ru) })).toBeVisible()
  await expect(article(page, 'Спорный пост.').getByRole('button', { name: m.discussions_hide({}, ru) })).toHaveCount(0)
  await signInAs('teacher')
  await page.goto(tab(made))
  const item = article(page, 'Спорный пост.')
  await clickUntil(item.getByRole('button', { name: m.discussions_hide({}, ru) }), () =>
    expect(item.getByText(m.discussions_hidden({}, ru), { exact: true })).toBeVisible({ timeout: 2000 }),
  )
  await item.getByRole('button', { name: m.discussions_restore({}, ru) }).click()
  await expect(item.getByRole('button', { name: m.discussions_hide({}, ru) })).toBeVisible()
  await expect(item.getByText(m.discussions_hidden({}, ru), { exact: true })).toHaveCount(0)
})

test('B-DSC-09 like toggles with the counts the server answers', async ({ page, signInAs, course, post }) => {
  const made = await course()
  await post(made, 'Полезный пост.', 'teacher')
  await signInAs('student')
  await page.goto(tab(made))
  const like = article(page, 'Полезный пост.').getByRole('button', { name: m.discussions_like({}, ru), exact: true })
  await clickUntil(like, () => expect(like).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 }))
  await expect(like).toHaveText('1')
  await like.click()
  await expect(like).toHaveAttribute('aria-pressed', 'false')
  await expect(like).toHaveText('0')
})

test('B-DSC-10 writes update the list from their answers, without reading it again', async ({
  page,
  signInAs,
  course,
  post,
}) => {
  const made = await course()
  await post(made, 'Пост для реакции.', 'teacher')
  await signInAs('student')
  await page.goto(tab(made))
  const reads: string[] = []
  page.on('request', sent => {
    if (sent.method() === 'GET' && /\/discussions\?/.test(sent.url())) reads.push(sent.url())
  })
  const like = article(page, 'Пост для реакции.').getByRole('button', { name: m.discussions_like({}, ru), exact: true })
  await clickUntil(like, () => expect(like).toHaveText('1', { timeout: 2000 }))
  const composer = page.getByRole('region', { name: m.discussions_new({}, ru) })
  await composer.getByRole('textbox').fill('Ещё один пост.')
  await composer.getByRole('button', { name: m.discussions_publish({}, ru) }).click()
  await expect(article(page, 'Ещё один пост.')).toBeVisible()
  expect(reads).toEqual([])
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-DSC-11 the discussions tab speaks ${locale}`, async ({ page, context, baseURL, signInAs, course }) => {
    const made = await course()
    await signInAs('student')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(tab(made))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { name: m.discussions_new({}, { locale }) })).toBeVisible()
    await expect(page.getByText(m.discussions_empty({}, { locale }))).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(course|discussions|editor|platform|ui)_[a-z_]+/)
  })
}
