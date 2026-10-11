import { readFileSync } from 'node:fs'

import { m } from '#/paraglide/messages'
import { createActivity, getActivity, listBlocks } from '#/shared/api/gen/sdk.gen'

import { cookieOf, expect, ru, test } from './course-studio-fixture'
import { expectOutage, expectReread } from '../fixtures/test'

// A 0.5 s H.264 MP4 made with ffmpeg's color source: real metadata and bytes, no external media service.
const video = {
  name: 'lecture.mp4',
  mimeType: 'video/mp4',
  buffer: readFileSync(new URL('../fixtures/lecture.mp4', import.meta.url)),
}

test.use({ as: 'teacher' })

test('B-CST-29 a hosted video uploads, is attached, plays, and can be replaced after reload', async ({
  page,
  studio,
  seed,
}) => {
  const made = await studio.course({ chapters: [{}] })
  const headers = cookieOf(seed, 'teacher')
  const { data: activity } = await createActivity({
    client: studio.api,
    path: { chapter_id: made.chapters[0]?.chapter.id ?? '' },
    body: { name: 'Lecture', activity_type: 'video', activity_sub_type: 'video_hosted' },
    headers,
    throwOnError: true,
  })
  await page.goto(`/teach/courses/${made.course.id}/activities/${activity.id}/edit`)
  const input = page.getByLabel(m.studio_video_file_field({}, ru))
  await input.setInputFiles(video)
  await expect(page.getByText(m.studio_media_uploaded({}, ru), { exact: true })).toBeVisible()
  const path = { activity_id: activity.id }
  const first = await getActivity({ client: studio.api, path, headers, throwOnError: true })
  expect(first.data.content).toMatchObject({ file_name: video.name })
  const link = page.getByRole('link', { name: m.studio_media_current({ name: video.name }, ru) })
  const href = await link.getAttribute('href')
  expect(href).toMatch(/^\/content\//)
  const response = await page.request.get(href ?? '')
  expect(response.ok()).toBe(true)
  expect((await response.body()).byteLength).toBe(video.buffer.byteLength)
  // The served storage file, not the picked blob, must have decodable video metadata.
  const playable = await page.evaluate(async source => {
    const element = document.createElement('video')
    return await new Promise<boolean>(resolve => {
      element.addEventListener('loadedmetadata', () => resolve(element.videoWidth > 0), { once: true })
      element.addEventListener('error', () => resolve(false), { once: true })
      element.src = source
    })
  }, href ?? '')
  expect(playable).toBe(true)
  await page.reload()
  expectOutage(page)
  expectReread(page, `/api/v2/activities/${activity.id}/blocks`)
  let claims = 0
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith(`/activities/${activity.id}/blocks`)) claims++
  })
  await page.route(`**/activities/${activity.id}`, route =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 503,
          json: { type: 'about:blank', title: 'Unavailable', status: 503, code: 'service-unavailable' },
        })
      : route.continue(),
  )
  await input.setInputFiles({ ...video, name: 'replacement.mp4' })
  await expect(page.getByText(m.errors_service_unavailable({}, ru))).toBeVisible()
  await expect(link).toBeVisible()
  await page.unroute(`**/activities/${activity.id}`)
  await page.getByRole('button', { name: m.ui_file_retry({}, ru) }).click()
  await expect(page.getByText(m.studio_media_replaced({}, ru), { exact: true })).toBeVisible()
  expect(claims).toBe(1)
  const second = await getActivity({ client: studio.api, path, headers, throwOnError: true })
  expect(second.data.content).toMatchObject({ file_name: 'replacement.mp4' })
  expect(second.data.version).toBeGreaterThan(first.data.version)
  await expect
    .poll(async () => (await listBlocks({ client: studio.api, path, headers, throwOnError: true })).data.length)
    .toBe(1)
})

test('B-CST-29 corrupt video bytes are refused before any upload; a valid video can then be retried after a 413', async ({
  page,
  studio,
  seed,
}) => {
  const made = await studio.course({ chapters: [{}] })
  const { data: activity } = await createActivity({
    client: studio.api,
    path: { chapter_id: made.chapters[0]?.chapter.id ?? '' },
    body: { name: 'Lecture', activity_type: 'video', activity_sub_type: 'video_hosted' },
    headers: cookieOf(seed, 'teacher'),
    throwOnError: true,
  })
  await page.goto(`/teach/courses/${made.course.id}/activities/${activity.id}/edit`)
  const uploads: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/uploads')) uploads.push(request.url())
  })
  const input = page.getByLabel(m.studio_video_file_field({}, ru))
  await input.setInputFiles({ ...video, buffer: Buffer.from('not a video') })
  await expect(page.getByText(m.ui_file_unplayable({}, ru))).toBeVisible()
  expect(uploads).toHaveLength(0)
  await page.route('**/ab-public/**', route =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 413 }) : route.continue(),
  )
  await input.setInputFiles(video)
  await expect(page.getByText(m.errors_payload_too_large({}, ru))).toBeVisible()
  await expect(page.getByText(m.studio_media_none({}, ru))).toBeVisible()
  await page.unroute('**/ab-public/**')
  await page.getByRole('button', { name: m.ui_file_retry({}, ru) }).click()
  await expect(page.getByText(m.studio_media_uploaded({}, ru), { exact: true })).toBeVisible()
})
