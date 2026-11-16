import { m } from '#/paraglide/messages'
import { getCourse, updateCourse } from '#/shared/api/gen/sdk.gen'
import { expect as baseExpect, type MadeCourse, test } from '../fixtures/learning'

// A course its author opened without sign-in (`guest_access`, B-CST-54): a guest reads its lessons (B-PLY-23,
// B-CRS-22). The rest of the player is player.spec.ts.
const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })
const ru = { locale: 'ru' } as const
const play = (course: MadeCourse, index = 0) => `/learn/${course.id}/${course.activityIds[index]}`

test('B-PLY-23 a course open without sign-in reads for a guest: lessons, no mark, the way to enrol', async ({
  page,
  api,
  seed,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 2 })
  const { name: cookieName, value } = seed.accounts.teacher.cookie
  const headers = { cookie: `${cookieName}=${value}` }
  const { data: current } = await getCourse({
    client: api,
    path: { course_id: course.id },
    headers,
    throwOnError: true,
  })
  await updateCourse({
    client: api,
    path: { course_id: course.id },
    body: { guest_access: true },
    headers: { ...headers, 'If-Match': current.version },
    throwOnError: true,
  })
  // The programme links its rows into the player for a guest.
  await page.goto(`/courses/${course.id}/about`)
  await page.getByRole('link', { name: 'Page 1', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${play(course)}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Page 1' })).toBeVisible()
  await expect(page.getByText(m.player_open_title({}, ru))).toBeVisible()
  await expect(page.getByRole('link', { name: m.player_open_enroll({}, ru) })).toHaveAttribute(
    'href',
    /^\/login\?redirect=/,
  )
  await expect(page.getByRole('button', { name: m.player_mark({}, ru) })).toHaveCount(0)
  await expect(page.getByText(m.player_progress_label({}, ru))).toHaveCount(0)
})
