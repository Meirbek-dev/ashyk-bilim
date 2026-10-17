import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { dashboardQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { FinalizedUpload, SessionInfo } from '#/shared/api/gen/types.gen'
import { useSessionExpired } from '#/shared/api/held-session'
import { createQueryClient } from '#/shared/api/query-client'
import { FakeStorage, json, SLOT } from '#/shared/api/testing'
import { sessionOptions } from '#/shared/auth/session'

import { FileInput } from './file-input'
import { SessionExpiredNotice } from './session-expired-notice'
import { renderInRouter } from './testing'

// A session that ends while an upload is held (`shared/api/held-session.ts`): any 401 keeps the page.

const label = 'Cover'
const png = (name: string) => new File(['abcd'], name, { type: 'image/png' })
const unauthorized = () =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'session-expired' }), {
    status: 401,
    headers: { 'content-type': 'application/problem+json' },
  })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeStorage.gate = Promise.resolve()
})

const signedInUser: SessionInfo = {
  user_id: 'u1',
  user: {
    id: 'u1',
    username: 'u1',
    display_name: 'U1',
    email: 'u1@e2e.test',
    locale: 'ru-RU',
    language: 'ru',
    email_verified: true,
    avatar_key: null,
    theme: null,
  },
  roles: [],
  permissions: [],
  capabilities: [],
  mfa_enabled: false,
}

/** The root document's notice, as the app renders it. */
function Notice() {
  return useSessionExpired() ? <SessionExpiredNotice /> : null
}

describe('a lost session seen first by another read', () => {
  test('a 401 elsewhere during the upload keeps the page: a sign-in notice, then the retry finalizes the stored file', async () => {
    let signedIn = false
    const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
      if (request.url.endsWith('/auth/session')) return signedIn ? json(signedInUser) : unauthorized()
      if (!request.url.endsWith('/finalize')) return json(SLOT)
      return signedIn ? json({ id: SLOT.id, key: SLOT.key, size_bytes: 4 }) : unauthorized()
    })
    vi.stubGlobal('fetch', api)
    vi.stubGlobal('XMLHttpRequest', FakeStorage)
    const held = Promise.withResolvers<null>()
    FakeStorage.gate = held.promise
    let guards = 0
    const client = createQueryClient(async () => void (guards += 1))
    client.setQueryData(sessionOptions().queryKey, signedInUser)
    const onUploaded = vi.fn<(upload: FinalizedUpload) => void>()
    const screen = await renderInRouter(
      <QueryClientProvider client={client}>
        <Notice />
        <FileInput label={label} purpose="course-thumbnail" onUploaded={onUploaded} />
      </QueryClientProvider>,
    )
    await userEvent.upload(screen.getByLabelText(label), png('a.png'))
    await expect.element(screen.getByRole('progressbar', { name: m.ui_file_uploading() })).toBeVisible()

    // Another read of the page answers 401 while the bytes are still on their way.
    const lost = new ApiError({
      status: 401,
      code: 'session-expired',
      fieldErrors: [],
      requestId: null,
      retryAfter: null,
    })
    await client.query({ queryKey: dashboardQueryKey(), queryFn: () => Promise.reject(lost) }).catch(() => undefined)
    await expect.element(screen.getByRole('alert').filter({ hasText: m.ui_session_expired() })).toBeVisible()
    await expect.element(screen.getByRole('link', { name: m.ui_file_sign_in() })).toHaveAttribute('target', '_blank')
    // The event stream's 401 reads the session again: it answers 401 too, and the page still stays.
    await client.query({ ...sessionOptions(), staleTime: 0 }).catch(() => null)
    expect(client.getQueryData(sessionOptions().queryKey)?.user_id).toBe('u1')
    expect(guards).toBe(0)

    held.resolve(null)
    await expect.element(screen.getByText(m.ui_file_session_lost())).toBeVisible()
    expect(guards).toBe(0)
    signedIn = true
    await screen.getByRole('button', { name: m.ui_file_retry() }).click()
    await expect.element(screen.getByText(m.ui_file_uploaded({ name: 'a.png' }))).toBeVisible()
    expect(onUploaded).toHaveBeenCalledTimes(1)
    expect(screen.getByText(m.ui_session_expired()).query()).toBeNull()
    expect(guards).toBe(0)
    expect(api.mock.calls.map(([request]) => new URL(request.url).pathname.split('/').pop())).toEqual([
      'uploads',
      'session',
      'finalize',
      'finalize',
    ])
  })
})
