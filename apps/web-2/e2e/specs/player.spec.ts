import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import {
  createActivity,
  createFileSubmission,
  getCurriculum,
  publishFileSubmission,
  updateActivity,
} from '#/shared/api/gen/sdk.gen'
import type { ActivityContent, ActivityId, ActivitySubType, ActivityType } from '#/shared/api/gen/types.gen'

import { expect as baseExpect, type MadeCourse, test as base } from '../fixtures/learning'

// Under `vp dev` six browsers pull the player's modules (editor, palette, hotkeys) unbundled at once: the first
// render after the SSR pending view can take longer than the default 5 s. The built image is far below that.
const expect = baseExpect.configure({ timeout: 15_000 })
base.describe.configure({ timeout: 60_000 })

const ru = { locale: 'ru' } as const
const PAGE_TEXT = 'Текст первой страницы'
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

type Extra = { name: string; type: ActivityType; subType: ActivitySubType; content?: ActivityContent }

// A made course (pages) plus activities of other types, added to its chapter by the teacher through the SDK.
const test = base.extend<{ addActivity: (course: MadeCourse, extra: Extra) => Promise<ActivityId> }>({
  addActivity: async ({ api, seed }, use) => {
    const { name: cookieName, value } = seed.accounts.teacher.cookie
    const headers = { cookie: `${cookieName}=${value}` }
    await use(async (course, { name, type, subType, content }) => {
      const { data: curriculum } = await getCurriculum({
        client: api,
        path: { course_id: course.id },
        headers,
        throwOnError: true,
      })
      const chapterId = curriculum.chapters[0]?.id ?? ''
      if (type === 'file_submission') {
        const body = { chapter_id: chapterId, title: name, instructions: 'Загрузите файл.' }
        const { data } = await createFileSubmission({ client: api, body, headers, throwOnError: true })
        await publishFileSubmission({ client: api, path: { file_submission_id: data.id }, headers, throwOnError: true })
        course.activityIds.push(data.activity_id)
        return data.activity_id
      }
      const { data: created } = await createActivity({
        client: api,
        path: { chapter_id: chapterId },
        body: { name, activity_type: type, activity_sub_type: subType },
        headers,
        throwOnError: true,
      })
      await updateActivity({
        client: api,
        path: { activity_id: created.id },
        body: { content, published: true },
        headers: { ...headers, 'If-Match': created.version },
        throwOnError: true,
      })
      course.activityIds.push(created.id)
      return created.id
    })
  },
})

const play = (course: MadeCourse, index = 0) => `/learn/${course.id}/${course.activityIds[index]}`
const contents = (page: Page) => page.getByRole('navigation', { name: m.ui_contents({}, ru) })
const neighbours = (page: Page) => page.getByRole('navigation', { name: m.player_neighbours({}, ru) })

test('B-PLY-01 a guest signs in first; the course staff get 403 in place', async ({ page, makeCourse, signInAs }) => {
  const course = await makeCourse({ activities: 1 })
  await page.goto(play(course))
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await signInAs('teacher')
  await page.goto(play(course))
  await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
})

test('B-PLY-01 a learner who is not enrolled gets 403 in place with the way to the course', async ({
  page,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  await learner.signIn()
  for (const path of [play(course), `/learn/${course.id}/complete`]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: m.platform_forbidden_title({}, ru) })).toBeVisible()
    await expect(page.getByText(m.player_forbidden_text({}, ru))).toBeVisible()
    await expect(page.getByRole('link', { name: m.player_course_page({}, ru) })).toHaveAttribute(
      'href',
      `/courses/${course.id}/about`,
    )
    expect(new URL(page.url()).pathname).toBe(path)
  }
})

test('B-PLY-02 an activity outside the course is not found', async ({ page, learner, makeCourse }) => {
  const [course, other] = await Promise.all([makeCourse({ activities: 1 }), makeCourse({ activities: 1 })])
  await learner.enroll(course)
  await learner.signIn()
  for (const id of [randomUUID(), other.activityIds[0]]) {
    await page.goto(`/learn/${course.id}/${id}`)
    await expect(page.getByRole('heading', { level: 1, name: m.player_not_found({}, ru) })).toBeVisible()
    await expect(page.getByRole('link', { name: m.player_course_page({}, ru) })).toBeVisible()
  }
})

test('B-PLY-03 B-PLY-05 B-PLY-06 B-PLY-07 B-PLY-08 a learner reads, marks a page done and moves on', async ({
  page,
  learner,
  makeCourse,
  addActivity,
}) => {
  // Publishing needs a published page: the empty "Page 1" comes first, the page with text second.
  const course = await makeCourse({ activities: 1 })
  const text: ActivityContent = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: PAGE_TEXT }] }],
  }
  await addActivity(course, { name: 'Вторая', type: 'dynamic', subType: 'dynamic_page', content: text })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(play(course, 1))

  await expect(page.getByRole('heading', { level: 1, name: 'Вторая' })).toBeVisible()
  await expect(page.getByText(PAGE_TEXT)).toBeVisible()
  await expect(contents(page).getByText(course.name)).toBeVisible()
  await expect(contents(page).getByText(m.player_progress({ done: 0, total: 2 }, ru))).toBeVisible()
  await expect(contents(page).getByRole('heading', { name: 'Chapter' })).toBeVisible()
  await expect(contents(page).getByRole('link', { name: /Вторая/ })).toHaveAttribute('aria-current', 'page')
  await expect(neighbours(page).getByRole('link')).toHaveText([m.player_prev({}, ru)])

  await page.getByRole('button', { name: m.player_mark({}, ru) }).click()
  await expect(page.getByText(m.player_marked({}, ru))).toBeVisible()
  await expect(contents(page).getByText(m.player_progress({ done: 1, total: 2 }, ru))).toBeVisible()
  await expect(contents(page).getByRole('link', { name: new RegExp(`Вторая.*${m.player_done({}, ru)}`) })).toBeVisible()
  // The server's next step is the page left behind: its URL is built from the id.
  await expect(page.getByRole('link', { name: m.player_continue({}, ru) })).toHaveAttribute('href', play(course))

  await neighbours(page)
    .getByRole('link', { name: `${m.player_prev({}, ru)}: Page 1` })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Page 1' })).toBeVisible()
  await expect(page.getByText(m.player_empty({}, ru))).toBeVisible()
  await expect(neighbours(page).getByRole('link')).toHaveText([m.player_next({}, ru)])
})

test('B-PLY-06 B-PLY-07 B-PLY-14 the last mark finishes the course and the summary shows the certificate', async ({
  page,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1, certificate: true })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(play(course))
  await page.getByRole('button', { name: m.player_mark({}, ru) }).click()
  await page.getByRole('link', { name: m.player_finish({}, ru) }).click()

  await expect(page).toHaveURL(`/learn/${course.id}/complete`)
  await expect(page.getByRole('heading', { level: 1, name: m.player_finish({}, ru) })).toBeVisible()
  await expect(page.getByText(new RegExp(`^${m.player_completed({}, ru)}`))).toBeVisible()
  const code = await learner.certificateCode(course)
  await expect(page.getByRole('link', { name: m.player_certificate_view({}, ru) })).toHaveAttribute(
    'href',
    `/certificates/${code}/verify`,
  )
  await expect(page.getByRole('link', { name: m.player_my_courses({}, ru) })).toHaveAttribute('href', '/learning')
  await expect(page.getByRole('link', { name: m.player_catalog({}, ru) })).toHaveAttribute('href', '/courses')
})

test('B-PLY-06 B-PLY-14 a done page can be unmarked; an unfinished course summary continues', async ({
  page,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 2, certificate: true })
  await learner.enroll(course, 1)
  await learner.signIn()
  await page.goto(play(course))
  await page.getByRole('button', { name: m.player_unmark({}, ru) }).click()
  await expect(page.getByText(m.player_unmarked({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.player_mark({}, ru) })).toBeVisible()

  await page.goto(`/learn/${course.id}/complete`)
  await expect(page.getByText(m.player_progress({ done: 0, total: 2 }, ru))).toBeVisible()
  await expect(page.getByText(m.player_certificate_pending({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.player_continue({}, ru) })).toHaveAttribute('href', play(course))
})

test('B-PLY-09 B-PLY-10 a YouTube video embeds without cookies; a document without a file says so', async ({
  page,
  learner,
  makeCourse,
  addActivity,
}) => {
  await page.route('https://www.youtube-nocookie.com/**', route =>
    route.fulfill({ body: '<!doctype html><title>video</title>' }),
  )
  const course = await makeCourse({ activities: 1 })
  await addActivity(course, { name: 'Видео', type: 'video', subType: 'video_youtube', content: { uri: YOUTUBE } })
  await addActivity(course, { name: 'Документ', type: 'document', subType: 'document_pdf', content: {} })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(play(course, 1))
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  )
  await neighbours(page)
    .getByRole('link', { name: /Документ/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Документ' })).toBeVisible()
  await expect(page.getByText(m.player_empty({}, ru))).toBeVisible()
})

test('B-PLY-11 graded work shows an entry card whose action opens its own address', async ({
  page,
  learner,
  makeCourse,
  addActivity,
}) => {
  const course = await makeCourse({ activities: 1 })
  const work: Extra = { name: 'Эссе', type: 'file_submission', subType: 'file_submission_standard' }
  await addActivity(course, work)
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(play(course, 1))
  await expect(page.getByRole('heading', { level: 1, name: 'Эссе' })).toBeVisible()
  await expect(page.getByText(m.player_state_not_started({}, ru))).toBeVisible()
  await expect(page.getByRole('button', { name: m.player_mark({}, ru) })).toHaveCount(0)
  await page.getByRole('link', { name: m.player_entry_start({}, ru) }).click()
  await expect(page).toHaveURL(`${play(course, 1)}/submission`)
  await expect(page.getByRole('heading', { level: 1, name: m.player_page_submission({}, ru) })).toBeVisible()
})

test('B-PLY-04 B-PLY-13 shortcuts move between activities, mark one done and open the contents', async ({
  page,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 2 })
  await learner.enroll(course)
  await learner.signIn()
  await page.goto(play(course))
  await expect(page.getByRole('heading', { level: 1, name: 'Page 1' })).toBeVisible()
  // A key pressed before hydration does nothing: retry until it acts.
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(play(course, 1), { timeout: 1000 })
  }).toPass()
  await expect(page.getByRole('heading', { level: 1, name: 'Page 2' })).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByText(m.player_marked({}, ru))).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('heading', { level: 1, name: 'Page 1' })).toBeVisible()

  await page.keyboard.press('Shift+?')
  const help = page.getByRole('dialog', { name: m.catalog_help_title({}, ru) })
  await expect(help.getByText(m.player_shortcut_next({}, ru))).toBeVisible()
  await expect(help.getByText(m.player_shortcut_mark({}, ru))).toBeVisible()
  await page.keyboard.press('Escape')

  // A phone: the contents are a sheet; picking an activity closes it.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: m.ui_contents({}, ru) }).click()
  const sheet = page.getByRole('dialog', { name: m.ui_contents({}, ru) })
  await sheet.getByRole('link', { name: /Page 2/ }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Page 2' })).toBeVisible()
  await page.keyboard.press('o')
  await expect(sheet).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-PLY-15 the player and the summary speak ${locale}`, async ({
    page,
    context,
    baseURL,
    learner,
    makeCourse,
  }) => {
    const course = await makeCourse({ activities: 1 })
    await learner.enroll(course)
    await learner.signIn()
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(play(course))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('button', { name: m.player_mark({}, { locale }) })).toBeVisible()
    await page.goto(`/learn/${course.id}/complete`)
    await expect(page.getByRole('heading', { level: 1, name: m.player_finish({}, { locale }) })).toBeVisible()
  })
}
