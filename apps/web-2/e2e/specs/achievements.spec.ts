import { randomUUID } from 'node:crypto'

import { m } from '#/paraglide/messages'
import { createClient, createConfig } from '#/shared/api/gen/client'
import { adminAward, dashboard, leaderboard, login, updatePreferences } from '#/shared/api/gen/sdk.gen'
import { formatNumber } from '#/shared/i18n/format'

import { registerAccount } from '../fixtures/accounts'
import { expect, test as base } from '../fixtures/seed'

const ru = { locale: 'ru' } as const
type Client = ReturnType<typeof createClient>
type Me = { userId: string; headers: { cookie: string }; client: Client }

async function signIn(client: Client, baseUrl: string): Promise<Me> {
  const account = await registerAccount(baseUrl)
  const { data, response } = await login({
    client,
    body: { login: account.username, password: account.password },
    throwOnError: true,
  })
  const cookie = /^[^;]+/.exec(response.headers.get('set-cookie') ?? '')?.[0] ?? ''
  return { userId: data.user_id, headers: { cookie }, client }
}

// Every test acts as a fresh account (its XP and preferences are its own), signed in through the SDK.
const test = base.extend<{ me: Me }>({
  me: async ({ baseURL, context }, use) => {
    const client = createClient(createConfig({ baseUrl: String(baseURL) }))
    const me = await signIn(client, String(baseURL))
    const [, name = '', value = ''] = /^([^=]+)=(.*)$/.exec(me.headers.cookie) ?? []
    await context.addCookies([{ name, value, url: String(baseURL) }])
    await use(me)
  },
})

const dashboardOf = async (me: Me) =>
  (await dashboard({ client: me.client, headers: me.headers, throwOnError: true })).data

test('B-ACH-01 a guest signs in first and comes back to /achievements', async ({ page, signInAs }) => {
  await page.goto('/achievements')
  await expect(page).toHaveURL(/\/login\?redirect=.*achievements/)
  await signInAs('student')
  await page.goto('/achievements')
  await expect(page.getByRole('heading', { level: 1, name: m.platform_nav_achievements({}, ru) })).toBeVisible()
})

test('B-ACH-02 level and progress come from the server; B-ACH-03 streaks; B-ACH-07 the latest award with its reason', async ({
  page,
  me,
  seed,
}) => {
  const reason = `E2E award ${randomUUID().slice(0, 8)}`
  const admin = seed.accounts.admin.cookie
  await adminAward({
    client: me.client,
    body: { user_id: me.userId, amount: 140, reason },
    headers: { cookie: `${admin.name}=${admin.value}` },
    throwOnError: true,
  })
  const { profile } = await dashboardOf(me)
  await page.goto('/achievements')
  const xp = formatNumber(profile.total_xp, {}, 'ru')
  await expect(page.getByText(m.achievements_summary({ level: profile.level, xp }, ru)).first()).toBeVisible()
  const bar = page.getByRole('progressbar', { name: m.achievements_progress_label({}, ru) })
  await expect(bar).toHaveAttribute('aria-valuenow', String(Math.round(profile.level_progress_percent)))
  const left = formatNumber(profile.xp_to_next_level, {}, 'ru')
  await expect(page.getByText(m.achievements_progress_left({ left, next: profile.level + 1 }, ru))).toBeVisible()

  const streaks = page.getByRole('region', { name: m.achievements_streaks_title({}, ru) })
  await expect(streaks.getByText(m.achievements_days({ count: profile.login_streak }, ru)).first()).toBeVisible()

  const feed = page.getByRole('region', { name: m.achievements_feed_title({}, ru) })
  const award = feed.getByRole('listitem').first()
  await expect(award).toContainText(m.achievements_source_admin_award({}, ru))
  await expect(award).toContainText(reason)
  await expect(award).toContainText('+140')
})

test('B-ACH-04 the own row is marked by id with the shared rank; B-ACH-05 the place is stated; B-ACH-06 "Show more" pages by 20', async ({
  page,
  me,
  baseURL,
}) => {
  // The board needs more than one page: top it up with fresh accounts on a young stand.
  const client = createClient(createConfig({ baseUrl: String(baseURL) }))
  const total = async () => (await leaderboard({ client, headers: me.headers, throwOnError: true })).data
  while ((await total()).total_participants <= 20) await signIn(client, String(baseURL))
  const { profile } = await dashboardOf(me)

  await page.goto('/achievements')
  const board = page.getByRole('region', { name: m.achievements_leaderboard_title({}, ru) })
  // Ranks are shared state that parallel tests move: the place line is checked by shape, the row by its owner.
  const place = m.achievements_your_place({ rank: '0', total: '0' }, ru).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(board.getByText(new RegExp(place.replaceAll('0', '[\\d\\s]+')))).toBeVisible()
  await expect(board.getByRole('link', { name: m.achievements_visibility_link({}, ru) })).toHaveAttribute(
    'href',
    '/settings/notifications',
  )
  const rows = board.getByRole('listitem')
  await expect(rows).toHaveCount(20)
  const more = board.getByRole('button', { name: m.ui_show_more({}, ru) })
  const mine = rows.filter({ has: page.getByText(m.achievements_you({}, ru), { exact: true }) })
  do {
    const before = await rows.count()
    await more.click()
    await expect.poll(() => rows.count()).toBeGreaterThan(before)
  } while ((await mine.count()) === 0 && (await more.isVisible()))
  await expect(mine).toHaveCount(1)
  await expect(mine).toHaveAttribute('aria-current', 'true')
  await expect(mine).toContainText(/#\d+/)
  const xp = formatNumber(profile.total_xp, {}, 'ru')
  await expect(mine).toContainText(m.achievements_summary({ level: profile.level, xp }, ru))
})

test('B-ACH-05 a learner hidden from the leaderboard is told so and pointed to the setting', async ({ page, me }) => {
  await updatePreferences({
    client: me.client,
    body: { privacy: { showOnLeaderboard: false } },
    headers: me.headers,
    throwOnError: true,
  })
  await page.goto('/achievements')
  const board = page.getByRole('region', { name: m.achievements_leaderboard_title({}, ru) })
  await expect(board.getByText(m.achievements_hidden({}, ru))).toBeVisible()
  await expect(board.getByText(m.achievements_you({}, ru), { exact: true })).toHaveCount(0)
  await board.getByRole('link', { name: m.achievements_visibility_link({}, ru) }).click()
  await expect(page).toHaveURL(/\/settings\/notifications$/)
})

for (const locale of ['kk', 'en'] as const) {
  test(`B-ACH-09 the achievements page speaks ${locale}`, async ({ page, context, baseURL, signInAs }) => {
    await signInAs('student')
    await context.addCookies([{ name: 'ab_locale', value: locale, url: String(baseURL) }])
    await page.goto('/achievements')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(
      page.getByRole('heading', { level: 1, name: m.platform_nav_achievements({}, { locale }) }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: m.achievements_leaderboard_title({}, { locale }) })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/\b(achievements|platform|ui|errors)_[a-z_]+/)
  })
}
