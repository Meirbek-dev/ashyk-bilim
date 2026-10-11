import { expect, test } from '../fixtures/seed'

// ROUND3 decision 21: the old web's addresses (bookmarks, e-mails) move permanently to their web-2 pages.
test('an old course address answers 301 to its web-2 page; an unknown one is a 404', async ({ page, seed }) => {
  const course = seed.params.courseId
  const moved = await page.request.get(`/kz/course/course_${course}`, { maxRedirects: 0 })
  expect(moved.status()).toBe(301)
  expect(moved.headers()['location']).toMatch(new RegExp(`/courses/${course}$`))
  const dash = await page.request.get(`/ru/dash/courses/${course}/curriculum`, { maxRedirects: 0 })
  expect(dash.headers()['location']).toMatch(new RegExp(`/teach/courses/${course}/content$`))
  expect((await page.request.get('/ru/no-such-page', { maxRedirects: 0 })).status()).toBe(404)
  await page.goto(`/ru/course/${course}`)
  await expect(page).toHaveURL(new RegExp(`/courses/${course}`))
})
