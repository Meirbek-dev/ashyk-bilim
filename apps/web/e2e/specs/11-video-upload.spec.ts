import { fileURLToPath } from 'node:url'
import { testAsTeacher as test, expect } from '../fixtures'
import { ActivityStudioPage } from '../page-objects/ActivityStudioPage'

const videoFile = fileURLToPath(new URL('../fixtures/lecture.mp4', import.meta.url))

test.use({ navigationTimeout: 90_000 })

test('video block survives storage failure, retry, reload and playback', async ({
  page,
  courseCreatePage,
  curriculumEditorPage,
}) => {
  test.setTimeout(120_000)
  await courseCreatePage.goto()
  const courseId = await courseCreatePage.createCourse({ title: `Video QA ${Date.now()}` })
  await curriculumEditorPage.goto(courseId)
  await curriculumEditorPage.createChapter('Video checks')
  await curriculumEditorPage.addActivityToChapter('Video checks', 'Dynamic', 'Video lecture')
  await curriculumEditorPage.configureActivity('Video lecture')
  const studio = new ActivityStudioPage(page)
  await studio.insertBlock('Video')
  const block = page.locator('.block-video').first()
  const picker = block.locator('input[type="file"]')

  let rejectPut = true
  await page.route('**/*', async route => {
    if (rejectPut && route.request().method() === 'PUT') {
      rejectPut = false
      await route.fulfill({ status: 500, body: 'storage unavailable' })
    } else {
      await route.continue()
    }
  })
  await picker.setInputFiles(videoFile)
  await expect(block.locator('.text-red-500')).toBeVisible({ timeout: 15_000 })
  await expect(block.locator('video')).toHaveCount(0)

  const attached = page.waitForResponse(
    response => response.request().method() === 'POST' && /\/activities\/[^/]+\/blocks$/u.test(response.url()),
  )
  await picker.setInputFiles(videoFile)
  const response = await attached
  expect(response.ok()).toBe(true)
  expect(response.request().headers()['idempotency-key']).toBeTruthy()
  await expect(block.locator('video')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/^saved$|activity saved/i).first()).toBeVisible({ timeout: 15_000 })
  await page.reload()
  const video = page.locator('.block-video video').first()
  await expect(video).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate(async node => {
    const player = node as HTMLVideoElement
    player.muted = true
    await player.play()
  })
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0)
  expect(await video.evaluate(node => (node as HTMLVideoElement).error)).toBeNull()
})
