import { randomUUID } from 'node:crypto'

import type { Browser, Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { currentSession, enroll, reportMessage, sendMessage } from '#/shared/api/gen/sdk.gen'

import { gotoLive } from '../fixtures/test'
import { expect, test } from '../fixtures/learning'

// Personal messages (docs/DIALOGS.md 11): a fresh learner of a made course and the seed teacher who made it. The
// teacher's tab is a second browser context, open before the learner writes: what reaches it comes live.

const ru = { locale: 'ru' } as const

const composer = (page: Page) => page.getByRole('textbox', { name: m.conversations_composer_label({}, ru) })
const feed = (page: Page) => page.getByRole('log', { name: m.conversations_feed_label({}, ru) })

/** A second browser context signed in as a seed account, with its page. */
async function signedInPage(browser: Browser, baseURL: string, cookie: { name: string; value: string }) {
  const context = await browser.newContext({ baseURL, locale: 'ru-RU' })
  await context.addCookies([{ ...cookie, url: baseURL }])
  return { context, page: await context.newPage() }
}

test('a learner writes to the teacher from the course page; the teacher sees it live and answers', async ({
  page,
  browser,
  baseURL,
  seed,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  await learner.enroll(course)
  await learner.signIn()
  const teacher = seed.accounts.teacher.session.user
  const teacherTab = await signedInPage(browser, String(baseURL), seed.accounts.teacher.cookie)
  await gotoLive(teacherTab.page, '/conversations')

  await gotoLive(page, `/courses/${course.id}/about`)
  await page.getByRole('link', { name: m.conversations_write_to({ name: teacher.display_name }, ru) }).click()
  await expect(page).toHaveURL(/\/conversations\/new\?/)
  const question = `Вопрос ${randomUUID().slice(0, 8)}`
  await composer(page).fill(question)
  await composer(page).press('Enter')
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/)
  await expect(feed(page).getByText(question)).toBeVisible()

  // The teacher's open list gets the conversation from the event stream, unread, without a reload.
  const row = teacherTab.page.getByRole('link', { name: learner.displayName, exact: true })
  await expect(row).toBeVisible()
  await expect(
    teacherTab.page.getByRole('link', { name: new RegExp(`^${m.conversations_title({}, ru)}: \\d+`) }),
  ).toBeVisible()
  await row.click()
  await expect(feed(teacherTab.page).getByText(question)).toBeVisible()
  const answer = `Ответ ${randomUUID().slice(0, 8)}`
  await composer(teacherTab.page).fill(answer)
  await teacherTab.page.getByRole('button', { name: m.conversations_send({}, ru) }).click()
  await expect(feed(teacherTab.page).getByText(answer)).toBeVisible()

  // The learner's open feed gets the answer; they delete their own question.
  await expect(feed(page).getByText(answer)).toBeVisible()
  await feed(page)
    .getByRole('button', { name: m.conversations_delete({}, ru) })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: m.conversations_delete({}, ru) })
    .click()
  await expect(feed(page).getByText(m.conversations_deleted({}, ru))).toBeVisible()
  await expect(feed(page).getByText(question)).toBeHidden()
  await teacherTab.context.close()
})

test('without a shared course there is no way to write, through the page or the API', async ({
  page,
  api,
  context,
  seed,
  learner,
}) => {
  await learner.signIn()
  const teacher = seed.accounts.teacher.session.user
  await page.goto(`/conversations/new?to=${teacher.id}`)
  await expect(page.getByText(m.conversations_deny_no_relation({}, ru))).toBeVisible()
  await expect(composer(page)).toBeHidden()

  const session = (await context.cookies()).find(cookie => cookie.name === seed.accounts.teacher.cookie.name)
  const { response, error } = await sendMessage({
    client: api,
    body: { to_user_id: teacher.id, body: 'Здравствуйте', client_key: randomUUID() },
    headers: { cookie: `${session?.name}=${session?.value}` },
  })
  expect(response?.status).toBe(403)
  expect(error).toMatchObject({ code: 'message-recipient-not-allowed' })
})

test('the list and the feed fit a 390 px phone', async ({ page, learner, makeCourse, seed }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const course = await makeCourse({ activities: 1 })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(`/conversations/new?to=${seed.accounts.teacher.session.user.id}&course=${course.id}`)
  await composer(page).fill('Длинное сообщение '.repeat(20))
  await page.getByRole('button', { name: m.conversations_send({}, ru) }).click()
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/)
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await fits()).toBe(true)
  await page.goto('/conversations')
  await expect(page.getByRole('heading', { name: m.conversations_title({}, ru), level: 1 })).toBeVisible()
  expect(await fits()).toBe(true)
})

test('a report reaches the admin with the text; a ban stops sending at once and is lifted', async ({
  page,
  browser,
  baseURL,
  api,
  context,
  seed,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  await learner.enroll(course)
  await learner.signIn()
  const { name, value } = seed.accounts.teacher.cookie
  const teacher = { cookie: `${name}=${value}` }
  const own = (await context.cookies()).find(cookie => cookie.name === name)
  const mine = { cookie: `${name}=${own?.value ?? ''}` }
  const { data: me } = await currentSession({ client: api, headers: mine, throwOnError: true })
  const send = (to: string, body: string, headers: { cookie: string }) =>
    sendMessage({ client: api, body: { to_user_id: to, body, client_key: randomUUID() }, headers, throwOnError: true })
  const { data: first } = await send(me.user_id, 'Здравствуйте', teacher)
  const rude = `Грубость ${randomUUID().slice(0, 8)}`
  const { data: reply } = await send(seed.accounts.teacher.session.user_id, rude, mine)
  await reportMessage({
    client: api,
    path: { message_id: reply.id },
    body: { reason: 'Оскорбление' },
    headers: teacher,
    throwOnError: true,
  })

  const admin = await signedInPage(browser, String(baseURL), seed.accounts.admin.cookie)
  await admin.page.goto('/admin/message-reports')
  await admin.page
    .getByRole('link', { name: m.conversations_report_author({ name: learner.displayName }, ru) })
    .first()
    .click()
  await expect(admin.page.getByText(rude).first()).toBeVisible()
  await admin.page.getByRole('button', { name: m.conversations_resolve({}, ru) }).click()
  const dialog = admin.page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: m.conversations_resolution_label({}, ru) }).fill('Запрет отправки')
  await dialog.getByRole('checkbox', { name: m.conversations_ban_label({}, ru) }).check()
  await dialog.getByRole('button', { name: m.conversations_resolve({}, ru) }).click()
  const unban = admin.page.getByRole('button', { name: m.conversations_unban({}, ru) })
  await expect(unban).toBeVisible()

  // The ban holds at once: the learner's feed shows the reason in place of the composer.
  await page.goto(`/conversations/${first.conversation_id}`)
  await expect(page.getByText(m.conversations_deny_banned({}, ru))).toBeVisible()
  await expect(composer(page)).toBeHidden()

  await unban.click()
  await admin.page
    .getByRole('alertdialog')
    .getByRole('button', { name: m.conversations_unban({}, ru) })
    .click()
  await expect(unban).toBeHidden()
  await page.reload()
  await expect(composer(page)).toBeVisible()
  await admin.context.close()
})

test('a message of files alone: the other side sees the file and downloads it', async ({
  page,
  browser,
  baseURL,
  seed,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  await learner.enroll(course)
  await learner.signIn()
  const teacherTab = await signedInPage(browser, String(baseURL), seed.accounts.teacher.cookie)

  await gotoLive(page, `/conversations/new?to=${seed.accounts.teacher.session.user.id}&course=${course.id}`)
  const name = `notes-${randomUUID().slice(0, 8)}.txt`
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('сдача') })
  const files = page.getByRole('list', { name: m.conversations_files_label({}, ru) })
  await expect(files.getByText(name)).toBeVisible()
  const send = page.getByRole('button', { name: m.conversations_send({}, ru) })
  await expect(send).toBeEnabled()
  await send.click()
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/)
  await expect(feed(page).getByRole('button', { name })).toBeVisible()

  // Fresh accounts share one display name: the teacher opens this conversation by its address.
  await gotoLive(teacherTab.page, new URL(page.url()).pathname)
  const file = feed(teacherTab.page).getByRole('button', { name })
  await expect(file).toBeVisible()
  const download = teacherTab.page.waitForEvent('download')
  await file.click()
  const saved = await download
  expect(saved.suggestedFilename()).toBe(name)
  const { readFile } = await import('node:fs/promises')
  expect(await readFile(await saved.path(), 'utf8')).toBe('сдача')
  await teacherTab.context.close()
})

test('the teacher writes to several learners of the course at once, with a file', async ({
  page,
  browser,
  baseURL,
  api,
  seed,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  await learner.enroll(course)
  const { name: cookieName, value } = seed.accounts.student.cookie
  await enroll({ client: api, path: { course_id: course.id }, headers: { cookie: `${cookieName}=${value}` } })
  const teacherTab = await signedInPage(browser, String(baseURL), seed.accounts.teacher.cookie)
  await gotoLive(teacherTab.page, `/teach/courses/${course.id}/learners`)
  await teacherTab.page.getByRole('button', { name: m.conversations_bulk_learners({}, ru) }).click()
  const dialog = teacherTab.page.getByRole('dialog')
  const text = `Объявление ${randomUUID().slice(0, 8)}`
  await dialog.getByRole('textbox', { name: m.conversations_bulk_text({}, ru) }).fill(text)
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'plan.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  })
  const sendAll = dialog.getByRole('button', { name: m.conversations_bulk_send({ count: 2 }, ru) })
  await expect(sendAll).toBeEnabled()
  await sendAll.click()
  await expect(teacherTab.page.getByText(m.conversations_bulk_sent({ count: 2 }, ru))).toBeVisible()

  // The learner has it in their own conversation with the teacher, with the file.
  await learner.signIn()
  await gotoLive(page, '/conversations')
  await page.getByRole('link', { name: seed.accounts.teacher.session.user.display_name, exact: true }).click()
  await expect(feed(page).getByText(text)).toBeVisible()
  await expect(feed(page).getByRole('button', { name: 'plan.pdf' })).toBeVisible()
  await teacherTab.context.close()
})
