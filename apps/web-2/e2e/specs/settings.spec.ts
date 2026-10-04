import type { Locator, Page } from '@playwright/test'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { dashboard, login, myProfile } from '#/shared/api/gen/sdk.gen'

import { type NewAccount, registerAccount, totp } from '../fixtures/accounts'
import { expect, test as base } from '../fixtures/seed'
import { clickUntil } from '../fixtures/test'

const ru = { locale: 'ru' } as const
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'

type Client = ReturnType<typeof createClient>
type Me = { account: NewAccount; headers: { cookie: string }; client: Client }

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

// Tests that change an account get a fresh one (registered, signed in through the SDK); read-only ones the student.
const test = base.extend<{ me: Me }>({
  me: async ({ baseURL, context }, use) => {
    const client = createClient(createConfig({ baseUrl: String(baseURL) }))
    const account = await registerAccount(String(baseURL))
    const [name, value] = await signIn(client, account)
    await context.addCookies([{ name, value, url: String(baseURL) }])
    await use({ account, headers: { cookie: `${name}=${value}` }, client })
  },
})

const profileOf = async (me: Me) => (await myProfile({ client: me.client, headers: me.headers })).data
const form = (page: Page, title: string) => page.getByRole('form', { name: title })
const save = (section: Locator) => section.getByRole('button', { name: m.ui_save({}, ru) }).click()

test('B-SET-01 /settings opens the profile; its sections are route tabs; a guest signs in first', async ({
  page,
  signInAs,
}) => {
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await signInAs('student')
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings\/profile$/)
  const tabs = page.getByRole('navigation', { name: m.ui_sections({}, ru) })
  await expect(tabs.getByRole('link')).toHaveText([
    m.platform_tab_profile({}, ru),
    m.platform_tab_security({}, ru),
    m.platform_tab_appearance({}, ru),
    m.platform_page_notifications({}, ru),
  ])
  await tabs.getByRole('link', { name: m.platform_tab_security({}, ru) }).click()
  await expect(page).toHaveURL(/\/settings\/security$/)
})

test('B-SET-02 the profile saves name and bio, shows them in the shell, and keeps input on a server error', async ({
  page,
  me,
}) => {
  await page.goto('/settings/profile')
  const details = form(page, m.settings_details_title({}, ru))
  await expect(details.getByText(me.account.username, { exact: true })).toBeVisible()
  await expect(details.getByText(me.account.email)).toBeVisible()
  await expect(details.getByRole('link', { name: m.settings_public_link({}, ru) })).toHaveAttribute(
    'href',
    `/users/${me.account.username}`,
  )
  const name = details.getByLabel(m.settings_field_display_name({}, ru), { exact: true })
  await name.fill('Айгерим Тестова')
  await details.getByLabel(m.settings_field_bio({}, ru)).fill('Учусь программировать.')
  await save(details)
  await expect(page.getByText(m.settings_saved({}, ru))).toBeVisible()
  await page.getByRole('button', { name: m.platform_profile_menu({}, ru) }).click()
  await expect(page.getByRole('menu').getByText('Айгерим Тестова')).toBeVisible()
  await page.keyboard.press('Escape')

  await details.getByLabel(m.settings_field_organization({}, ru)).fill('')
  await save(details)
  await expect(details.getByText(m.validation_required({}, ru))).toBeVisible()
  await expect(name).toHaveValue('Айгерим Тестова')
})

test('B-SET-03 a file that is not an image is refused before any upload', async ({ page, signInAs }) => {
  await signInAs('student')
  const uploads: string[] = []
  page.on('request', request => {
    if (request.url().includes('/api/v2/uploads')) uploads.push(request.url())
  })
  await page.goto('/settings/profile')
  await expect(page.getByRole('button', { name: m.settings_avatar_choose({}, ru) })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a photo'),
  })
  await expect(page.getByRole('alert').getByText(m.settings_avatar_wrong_type({}, ru))).toBeVisible()
  expect(uploads).toEqual([])
})

test('B-SET-05 builder sections are added, reordered and removed; B-SET-06 a non-http link is refused', async ({
  page,
  signInAs,
}) => {
  await signInAs('student')
  await page.goto('/settings/profile')
  const builder = form(page, m.settings_builder_title({}, ru))
  const add = async (kind: string) => {
    await clickUntil(builder.getByRole('button', { name: m.settings_builder_add({}, ru) }), () =>
      expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 }),
    )
    await page.getByRole('menuitem', { name: kind }).click()
  }
  await add(m.settings_section_text({}, ru))
  await add(m.settings_section_links({}, ru))
  const legends = builder.locator('fieldset > legend:not(.sr-only)')
  await expect(legends).toHaveText([m.settings_section_text({}, ru), m.settings_section_links({}, ru)])
  const links = builder.getByRole('group', { name: m.settings_section_links({}, ru), exact: true })
  await links.getByRole('button', { name: m.settings_builder_up({}, ru) }).click()
  await expect(legends).toHaveText([m.settings_section_links({}, ru), m.settings_section_text({}, ru)])
  const text = builder.getByRole('group', { name: m.settings_section_text({}, ru), exact: true })
  await text.getByRole('button', { name: m.settings_builder_remove({}, ru) }).click()
  await expect(legends).toHaveText([m.settings_section_links({}, ru)])
  await links.getByRole('button', { name: m.settings_builder_item_add({}, ru) }).click()
  await links.getByLabel(m.settings_item_url({}, ru)).fill('ftp://example.test')
  const patches: string[] = []
  page.on('request', request => {
    if (request.method() === 'PATCH') patches.push(request.url())
  })
  await save(builder)
  await expect(links.getByText(m.settings_builder_url_invalid({}, ru))).toBeVisible()
  expect(patches).toEqual([])
})

test('B-SET-08 this device is marked and another session ends; B-SET-07 a password change ends the rest', async ({
  page,
  me,
}) => {
  await signIn(me.client, me.account, FIREFOX_WINDOWS)
  await signIn(me.client, me.account, SAFARI_MAC)
  await page.goto('/settings/security')
  await expect(page.getByRole('listitem').first().getByText(m.settings_session_current({}, ru))).toBeVisible()
  const firefox = page.getByRole('listitem').filter({ hasText: 'Firefox, Windows' })
  const safari = page.getByRole('listitem').filter({ hasText: 'Safari, macOS' })
  await expect(firefox.getByText(m.settings_session_ip({ ip: '' }, ru).trim(), { exact: false })).toBeVisible()
  const confirm = page.getByRole('alertdialog', {
    name: m.settings_session_revoke_title({ device: 'Firefox, Windows' }, ru),
  })
  await clickUntil(firefox.getByRole('button', { name: m.settings_session_revoke({}, ru) }), () =>
    expect(confirm).toBeVisible({ timeout: 1000 }),
  )
  await expect(confirm.getByRole('button', { name: m.ui_cancel({}, ru) })).toBeFocused()
  await confirm.getByRole('button', { name: m.settings_session_revoke({}, ru) }).click()
  await expect(page.getByText(m.settings_session_revoked({}, ru))).toBeVisible()
  await expect(firefox).toHaveCount(0)
  const password = form(page, m.settings_password_title({}, ru))
  const current = password.getByLabel(m.settings_field_current_password({}, ru))
  await current.fill('not-the-password')
  await password.getByLabel(m.settings_field_new_password({}, ru)).fill('Nov-Parol-2026!')
  await save(password)
  await expect(password.getByText(m.errors_invalid_credentials({}, ru))).toBeVisible()
  await current.fill(me.account.password)
  await save(password)
  await expect(page.getByText(m.settings_password_changed({}, ru))).toBeVisible({ timeout: 20_000 }) // Zitadel is slow
  await expect(current).toHaveValue('')
  await expect(safari).toHaveCount(0)
})

test('B-SET-09 2FA turns on with the code from the QR key; B-SET-10 it turns off after a confirmation', async ({
  page,
  me,
}) => {
  await page.goto('/settings/security')
  const section = page.getByRole('region', { name: m.settings_totp_title({}, ru) })
  await expect(section.getByText(m.settings_totp_off({}, ru))).toBeVisible()
  await clickUntil(section.getByRole('button', { name: m.settings_totp_enable({}, ru) }), () =>
    expect(section.getByLabel(m.settings_totp_qr({}, ru))).toBeVisible({ timeout: 2000 }),
  )
  await expect(section.getByRole('link', { name: m.settings_totp_open_app({}, ru) })).toHaveAttribute(
    'href',
    /^otpauth:\/\//,
  )
  const keyLine = await section.getByText(m.settings_totp_secret({ secret: '' }, ru).trim()).textContent()
  const secret = /([A-Z2-7]{16,})/.exec(keyLine ?? '')?.[1] ?? ''
  const code = section.getByLabel(m.settings_totp_code({}, ru))
  await code.fill(totp(secret) === '000000' ? '111111' : '000000')
  await section.getByRole('button', { name: m.settings_totp_confirm({}, ru) }).click()
  await expect(section.getByText(m.errors_invalid_totp_code({}, ru))).toBeVisible()
  await code.fill(totp(secret))
  await section.getByRole('button', { name: m.settings_totp_confirm({}, ru) }).click()
  await expect(page.getByText(m.settings_totp_enabled({}, ru))).toBeVisible()
  await expect(section.getByText(m.settings_totp_on({}, ru))).toBeVisible()

  const confirm = page.getByRole('alertdialog', { name: m.settings_totp_disable_title({}, ru) })
  await section.getByRole('button', { name: m.settings_totp_disable({}, ru) }).click()
  await confirm.getByRole('button', { name: m.settings_totp_disable({}, ru) }).click()
  await expect(page.getByText(m.settings_totp_disabled({}, ru))).toBeVisible()
  await expect(section.getByRole('button', { name: m.settings_totp_enable({}, ru) })).toBeVisible()
  await expect.poll(async () => (await profileOf(me))?.mfa_enabled).toBe(false)
})

test('B-SET-11 theme and mode apply without a reload; B-SET-12 the language switches and is saved', async ({
  page,
  me,
}) => {
  await page.goto('/settings/appearance')
  const appearance = form(page, m.settings_appearance_title({}, ru))
  await appearance.getByText('T3 Chat', { exact: true }).click()
  await appearance.getByText(m.ui_mode_dark({}, ru), { exact: true }).click()
  await save(appearance)
  await expect(page.getByText(m.settings_saved({}, ru))).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
  await expect(page.locator('link[href="/themes/t3-chat.css"]')).toHaveCount(1)
  await expect.poll(async () => (await profileOf(me))?.theme).toBe('t3-chat')

  await appearance.getByText(m.ui_locale_name({}, { locale: 'kk' }), { exact: true }).click()
  await save(appearance)
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')
  await expect(
    page.getByRole('heading', { level: 1, name: m.platform_page_settings({}, { locale: 'kk' }) }),
  ).toBeVisible()
  await expect.poll(async () => (await profileOf(me))?.locale).toBe('kk-KZ')
})

test('B-SET-13 the gamification switches are saved and read back', async ({ page, me }) => {
  await page.goto('/settings/notifications')
  const section = form(page, m.settings_gamification_title({}, ru))
  const xp = section.getByRole('switch', { name: m.settings_field_xp_gain({}, ru) })
  const leaderboard = section.getByRole('switch', { name: m.settings_field_leaderboard({}, ru) })
  await expect(xp).toBeChecked()
  await expect(leaderboard).toBeChecked()
  await xp.click()
  await leaderboard.click()
  await save(section)
  await expect(page.getByText(m.settings_saved({}, ru))).toBeVisible()
  await page.reload()
  await expect(xp).not.toBeChecked()
  await expect(leaderboard).not.toBeChecked()
  const { data } = await dashboard({ client: me.client, headers: me.headers })
  expect(data?.profile.preferences['privacy']).toEqual({ showOnLeaderboard: false })
})

test('B-SET-14 the public profile comes in the server document with the courses; an unknown user is not found', async ({
  page,
  seed,
}) => {
  const document = await page.request.get(`/users/${seed.params.username}`)
  expect(await document.text()).toContain('E2E teacher')
  await page.goto(`/users/${seed.params.username}`)
  await expect(page.getByRole('heading', { level: 1, name: 'E2E teacher' })).toBeVisible()
  await expect(page.getByText(`@${seed.params.username}`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'E2E seed course' })).toHaveAttribute(
    'href',
    `/courses/${seed.params.courseId}`,
  )
  await page.goto('/users/nobody-e2e-unknown')
  await expect(page.getByRole('heading', { level: 1, name: m.settings_user_not_found({}, ru) })).toBeVisible()
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-SET-15 the settings and profile pages speak ${locale}`, async ({
    page,
    context,
    baseURL,
    signInAs,
    seed,
  }) => {
    await signInAs('student')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    const settings = m.platform_page_settings({}, { locale })
    const pages = [
      ['/settings/profile', settings],
      ['/settings/security', settings],
      ['/settings/appearance', settings],
      ['/settings/notifications', settings],
      [`/users/${seed.params.username}`, 'E2E teacher'],
    ] as const
    for (const [path, title] of pages) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.locator('body')).not.toContainText(/\b(settings|platform|ui|errors)_[a-z_]+/)
    }
  })
}
