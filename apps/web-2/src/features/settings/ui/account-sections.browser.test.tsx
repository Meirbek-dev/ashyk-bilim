import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { UserProfile } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { DeleteAccountSection } from './delete-account-section'
import { EmailSection } from './email-section'

const profile: UserProfile = {
  id: '0190a5d2-0000-7000-8000-000000000031',
  username: 'aigerim',
  email: 'aigerim@example.com',
  display_name: 'Айгерим',
  organization: 'КазНУ',
  bio: '',
  avatar_key: null,
  email_verified: true,
  google_linked: false,
  has_password: true,
  language: 'ru',
  locale: 'ru-RU',
  mfa_enabled: false,
  profile: { sections: [] },
  theme: null,
  version: 1,
}

const problem = (status: number, code: string) =>
  Response.json(
    { type: 'about:blank', title: code, status, code, detail: code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )

afterEach(() => vi.unstubAllGlobals())

async function show(ui: ReactNode, reply: (request: Request) => Response) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return Promise.resolve(reply(request))
  })
  const screen = await renderInRouter(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)
  return { screen, requests }
}

describe('EmailSection', () => {
  test('B-SET-22 the new address and the password send a code; the code from the email switches the account', async () => {
    const { screen, requests } = await show(<EmailSection profile={profile} />, request =>
      request.url.endsWith('/auth/email') ? new Response(null, { status: 202 }) : new Response(null, { status: 204 }),
    )
    await expect.element(screen.getByText(m.settings_email_current({ email: profile.email }))).toBeInTheDocument()
    await screen.getByLabelText(m.settings_field_new_email()).fill('new@example.com')
    await screen.getByLabelText(m.settings_field_current_password()).fill('right horse')
    await screen.getByRole('button', { name: m.settings_email_send() }).click()
    await expect.element(screen.getByLabelText(m.settings_field_email_code())).toBeInTheDocument()
    expect(await requests[0]?.clone().json()).toEqual({ email: 'new@example.com', password: 'right horse' })
    await screen.getByLabelText(m.settings_field_email_code()).fill('123456')
    await screen.getByRole('button', { name: m.settings_email_confirm() }).click()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1]?.url).toMatch(/\/auth\/email\/confirm$/)
    expect(await requests[1]?.clone().json()).toEqual({ code: '123456' })
  })

  test('B-SET-22 a wrong password is that field’s error and the step stays', async () => {
    const { screen } = await show(<EmailSection profile={profile} />, () => problem(401, 'invalid-credentials'))
    await screen.getByLabelText(m.settings_field_new_email()).fill('new@example.com')
    await screen.getByLabelText(m.settings_field_current_password()).fill('wrong')
    await screen.getByRole('button', { name: m.settings_email_send() }).click()
    await expect.element(screen.getByText(m.settings_current_password_wrong())).toBeInTheDocument()
    await expect.element(screen.getByLabelText(m.settings_field_email_code())).not.toBeInTheDocument()
  })
})

describe('DeleteAccountSection', () => {
  test('B-SET-23 the password confirms the deletion; a staff account hears why it cannot', async () => {
    const { screen, requests } = await show(<DeleteAccountSection profile={profile} />, () =>
      problem(409, 'account-has-roles'),
    )
    await screen.getByRole('button', { name: m.settings_delete_button() }).click()
    await screen.getByLabelText(m.settings_field_current_password()).fill('right horse')
    await screen.getByRole('button', { name: m.settings_delete_submit() }).click()
    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.errors_account_has_roles())
    expect(requests[0]?.url).toMatch(/\/users\/me\/deletion$/)
    expect(await requests[0]?.clone().json()).toEqual({ password: 'right horse' })
  })

  test('B-SET-23 a Google-only account types its username; a mismatch sends nothing', async () => {
    const google = { ...profile, has_password: false, google_linked: true }
    const { screen, requests } = await show(<DeleteAccountSection profile={google} />, () => problem(500, 'internal'))
    await screen.getByRole('button', { name: m.settings_delete_button() }).click()
    await screen.getByLabelText(m.settings_field_username()).fill('someone')
    await screen.getByRole('button', { name: m.settings_delete_submit() }).click()
    await expect.element(screen.getByText(m.settings_delete_mismatch({ username: 'aigerim' }))).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })
})
