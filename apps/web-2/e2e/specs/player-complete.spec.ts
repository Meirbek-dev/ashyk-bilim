import { m } from '#/paraglide/messages'
import { createCertification } from '#/shared/api/gen/sdk.gen'

import { expect as baseExpect, test } from '../fixtures/learning'

// The course summary's certificate (`/learn/$courseId/complete`), apart from player.spec.ts (its size cap).

const expect = baseExpect.configure({ timeout: 15_000 })
const ru = { locale: 'ru' } as const

test('B-PLY-14 B-PLY-16 a course finished before its certificate was set up issues one when the summary opens', async ({
  page,
  api,
  seed,
  learner,
  makeCourse,
}) => {
  const course = await makeCourse({ activities: 1 })
  await learner.enroll(course, 1)
  const { name, value } = seed.accounts.teacher.cookie
  const headers = { cookie: `${name}=${value}` }
  await createCertification({ client: api, body: { course_id: course.id, config: {} }, headers, throwOnError: true })
  await learner.signIn()
  await page.goto(`/learn/${course.id}/complete`)

  const link = page.getByRole('link', { name: m.player_certificate_view({}, ru) })
  await expect(link).toBeVisible()
  await expect(page.getByText(m.player_certificate_pending({}, ru))).toHaveCount(0)
  const code = await learner.certificateCode(course)
  await expect(link).toHaveAttribute('href', `/certificates/${code}/verify`)
  // B-PLY-14: the PDF is offered right there, in the interface language.
  const pdf = page.getByRole('link', { name: m.certificates_download_pdf({}, ru) })
  await expect(pdf).toHaveAttribute('href', `/api/v2/certificates/${code}/pdf?lang=ru`)
})
