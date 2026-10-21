import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { login } from '#/shared/api/gen/sdk.gen'

import { type NewAccount, registerAccount } from '../fixtures/accounts'
import { expect, test as base } from '../fixtures/seed'
import { clickUntil } from '../fixtures/test'

const ru = { locale: 'ru' } as const
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'

type Client = ReturnType<typeof createClient>

/** One more session of the account (another device when `userAgent` says so); returns its cookie pair. */
async function signIn(client: Client, account: NewAccount, userAgent?: string): Promise<[string, string]> {
  const { response } = await login({
    client,
    body: { login: account.username, password: account.password },
    headers: userAgent ? { 'user-agent': userAgent } : {},
    throwOnError: true,
  })
  const pair = /^([^=;]+)=([^;]*)/.exec(response.headers.get('set-cookie') ?? '')
  if (!pair?.[1] || pair[2] === undefined) throw new Error('sign-in set no session cookie')
  return [pair[1], pair[2]]
}

// A fresh account per test, signed in in this browser: its other sessions are made through the SDK.
const test = base.extend<{ me: { account: NewAccount; client: Client } }>({
  me: async ({ baseURL, context }, use) => {
    const client = createClient(createConfig({ baseUrl: String(baseURL) }))
    const account = await registerAccount(String(baseURL))
    const [name, value] = await signIn(client, account)
    await context.addCookies([{ name, value, url: String(baseURL) }])
    await use({ account, client })
  },
})

test('B-SET-17 every other session ends at once after one confirmation', async ({ page, me }) => {
  await signIn(me.client, me.account, FIREFOX_WINDOWS)
  await signIn(me.client, me.account, SAFARI_MAC)
  await page.goto('/settings/security')
  const sessions = page.getByRole('region', { name: m.settings_sessions_title({}, ru) })
  await expect(sessions.getByRole('listitem')).toHaveCount(3)
  const confirm = page.getByRole('alertdialog', { name: m.settings_sessions_revoke_others_title({}, ru) })
  await clickUntil(sessions.getByRole('button', { name: m.settings_sessions_revoke_others({}, ru) }), () =>
    expect(confirm).toBeVisible({ timeout: 1000 }),
  )
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.settings_sessions_revoke_others_confirm({}, ru) }).click()
  await expect(page.getByText(m.settings_sessions_revoked_others({}, ru))).toBeVisible()
  await expect(sessions.getByRole('listitem')).toHaveCount(1)
  await expect(sessions.getByText(m.settings_session_current({}, ru))).toBeVisible()
  await page.reload()
  await expect(sessions.getByRole('listitem')).toHaveCount(1)
})

test('B-SET-18 a picked theme and mode show at once; leaving without Save puts back the saved ones', async ({
  page,
  me,
}) => {
  await page.goto('/settings/appearance')
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  await page.getByText('Слива', { exact: true }).click() // t3-chat
  await page.getByText(m.ui_mode_dark({}, ru), { exact: true }).click()
  await expect(html).toHaveAttribute('data-theme', 't3-chat')
  await expect(html).toHaveAttribute('data-mode', 'dark')
  await expect(page.locator('link[href="/themes/t3-chat.css"]')).toHaveCount(1)
  page.once('dialog', dialog => void dialog.accept())
  await page
    .getByRole('navigation')
    .getByRole('link', { name: m.platform_nav_home({}, ru) })
    .first()
    .click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(html).toHaveAttribute('data-theme', String(before))
  await expect(html).not.toHaveAttribute('data-mode', 'dark')
  expect(me.account.username).toBeTruthy()
})
