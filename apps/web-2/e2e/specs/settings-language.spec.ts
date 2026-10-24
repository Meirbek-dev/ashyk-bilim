import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { login, myProfile } from '#/shared/api/gen/sdk.gen'

import { registerAccount } from '../fixtures/accounts'
import { expect, test } from '../fixtures/seed'
import { clickUntil, finishPages } from '../fixtures/test'

// The language of a signed-in user lives in the profile (ROUND3 decision 20): a fresh account per test.
const ru = { locale: 'ru' } as const

test('B-SET-12 the profile menu saves the language to the profile; a sign-in elsewhere brings it back', async ({
  page,
  context,
  baseURL,
}) => {
  const client = createClient(createConfig({ baseUrl: String(baseURL) }))
  const account = await registerAccount(String(baseURL))
  const { response } = await login({
    client,
    body: { login: account.username, password: account.password },
    throwOnError: true,
  })
  const [, name = '', value = ''] = /^([^=;]+)=([^;]*)/.exec(response.headers.get('set-cookie') ?? '') ?? []
  await context.addCookies([{ name, value, url: String(baseURL) }])
  const language = async () =>
    (await myProfile({ client, headers: { cookie: `${name}=${value}` }, throwOnError: true })).data.language
  await page.goto('/home')
  const languageItem = page.getByRole('menuitem', { name: m.ui_locale({}, ru) })
  await clickUntil(page.getByRole('button', { name: m.platform_profile_menu({}, ru) }), () =>
    expect(languageItem).toBeVisible({ timeout: 1000 }),
  )
  await languageItem.click()
  await page.getByRole('menuitemradio', { name: m.ui_locale_name({}, { locale: 'en' }) }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect.poll(language).toBe('en')

  // Another device, set to Russian, signs in: the next page is in the profile's language.
  await finishPages(context)
  await context.clearCookies()
  await context.addCookies([{ name: 'ab_locale', value: 'ru', url: String(baseURL) }])
  await page.goto('/login?redirect=%2Fcollections')
  await page.getByLabel(m.auth_login_field_login({}, ru)).fill(account.username)
  await page.getByLabel(m.auth_login_field_password({}, ru), { exact: true }).fill(account.password)
  await page.getByRole('button', { name: m.auth_login_submit({}, ru) }).click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  // A signed-in visitor of /login (where a Google sign-in returns) goes on to the redirect.
  await page.goto('/login?redirect=%2Fcourses')
  await expect(page).toHaveURL(/\/courses$/)
})
