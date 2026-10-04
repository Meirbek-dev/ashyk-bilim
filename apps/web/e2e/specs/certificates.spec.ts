import { m } from '#/paraglide/messages'
import { formatDate } from '#/shared/i18n/format'

import { expect, test as base } from '../fixtures/learning'

const ru = { locale: 'ru' } as const

// Every test verifies a certificate of its own: a fresh learner finishes a fresh certified course.
const test = base.extend<{ issued: { code: string; course: string; holder: string } }>({
  issued: async ({ learner, makeCourse }, use) => {
    const course = await makeCourse({ certificate: true })
    await learner.enroll(course, 2)
    await use({ code: await learner.certificateCode(course), course: course.name, holder: learner.displayName })
  },
})

test(
  'B-CRT-01 B-CRT-03 a guest gets the verdict, the holder and the course in the server-rendered document',
  { tag: '@smoke' },
  async ({ page, issued }) => {
    const document = await page.request.get(`/certificates/${issued.code}/verify`)
    expect(document.status()).toBe(200)
    const html = await document.text()
    expect(html).toContain(m.certificates_valid({}, ru))
    expect(html).toContain(issued.holder)
    const title = m.certificates_og_title({ holder: issued.holder, course: issued.course }, ru)
    expect(html).toContain(`property="og:title" content="${title}"`)
    expect(html).toContain('property="og:description"')

    await page.goto(`/certificates/${issued.code}/verify`)
    await expect(page.getByRole('heading', { level: 1, name: issued.course })).toBeVisible()
    await expect(page.getByText(m.certificates_valid({}, ru))).toBeVisible()
    await expect(page.getByText(issued.holder)).toBeVisible()
    await expect(page.getByText(issued.code)).toBeVisible()
    await expect(page.getByText(formatDate(Date.now() / 1000, 'ru'))).toBeVisible()
    await expect(page).toHaveTitle(title)
  },
)

test('B-CRT-02 an unknown code is not valid and answers 404; the code is read without case and dashes', async ({
  page,
  issued,
}) => {
  const unknown = 'NOPE-0000-0000-0000'
  const document = await page.request.get(`/certificates/${unknown}/verify`)
  expect(document.status()).toBe(404)
  await page.goto(`/certificates/${unknown}/verify`)
  await expect(page.getByRole('heading', { level: 1, name: m.certificates_not_found({}, ru) })).toBeVisible()
  await expect(page.getByText(m.certificates_invalid({}, ru))).toBeVisible()
  await expect(page.getByText(m.certificates_not_found_hint({ code: unknown }, ru))).toBeVisible()

  await page.goto(`/certificates/${issued.code.replaceAll('-', '').toLowerCase()}/verify`)
  await expect(page.getByText(m.certificates_valid({}, ru))).toBeVisible()
})

test('B-CRT-04 "Download PDF" is a plain link to the server PDF', async ({ page, issued }) => {
  await page.goto(`/certificates/${issued.code}/verify`)
  const link = page.getByRole('link', { name: m.certificates_download_pdf({}, ru) })
  await expect(link).toHaveAttribute('href', `/api/v2/certificates/${issued.code}/pdf`)
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
  expect(download.suggestedFilename()).toBe(`certificate-${issued.code}.pdf`)
})

test('B-CRT-06 the URL printed on the PDF opens the same page in the certificate language and keeps it', async ({
  page,
  context,
  issued,
}) => {
  const document = await page.request.get(`/kz/certificates/${issued.code}/verify`)
  expect(document.status()).toBe(200)
  expect(await document.text()).toContain(m.certificates_valid({}, { locale: 'kk' }))

  await context.clearCookies()
  await page.goto(`/kz/certificates/${issued.code}/verify`)
  await expect(page).toHaveURL(new RegExp(`/kz/certificates/${issued.code}/verify$`))
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')
  await expect(page.getByRole('heading', { level: 1, name: issued.course })).toBeVisible()
  await expect(page.getByText(m.certificates_valid({}, { locale: 'kk' }))).toBeVisible()
  expect((await context.cookies()).find(cookie => cookie.name === 'ab_locale')?.value).toBe('kk')
  await page.goto('/collections')
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')

  await page.goto(`/en/certificates/${issued.code}/verify`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByText(m.certificates_holder({}, { locale: 'en' }))).toBeVisible()

  await page.goto(`/de/certificates/${issued.code}/verify`)
  await expect(
    page.getByRole('heading', { level: 1, name: m.platform_not_found_title({}, { locale: 'en' }) }),
  ).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-CRT-05 the verify page speaks ${locale}`, async ({ page, context, baseURL, issued }) => {
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto(`/certificates/${issued.code}/verify`)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByText(m.certificates_valid({}, { locale }))).toBeVisible()
    await expect(page.getByText(m.certificates_holder({}, { locale }))).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(certificates|platform|ui)_[a-z_]+/)
  })
}
