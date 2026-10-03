import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vite-plus/test'

import { myProfileQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'

import { avatarOptions } from './queries'

const SLOT = { id: '0190a5d2-0000-7000-8000-000000000001', key: 'avatar/a', put_url: 'https://storage.test/put' }
const PROFILE = {
  id: '0190a5d2-0000-7000-8000-000000000002',
  username: 'learner',
  email: 'learner@e2e.test',
  display_name: 'Learner',
  bio: '',
  avatar_key: SLOT.key,
  locale: 'ru-RU',
  organization: 'School',
  profile: { sections: [] },
  theme: null,
  mfa_enabled: false,
  has_password: true,
  google_linked: false,
}

/** Storage's side of the presigned PUT: accepts the bytes. */
class FakeStorage extends EventTarget {
  readonly upload = new EventTarget()
  status = 200
  open() {}
  setRequestHeader() {}
  send() {
    this.dispatchEvent(new Event('load'))
  }
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } })

afterEach(() => vi.unstubAllGlobals())

test('B-SET-04 a picked photo is uploaded as an avatar and claimed by the profile', async () => {
  const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
    if (request.url.endsWith('/finalize')) return json({ id: SLOT.id, key: SLOT.key, size_bytes: 4 })
    if (request.url.endsWith('/uploads')) return json(SLOT)
    return json(PROFILE, { etag: '"3"' })
  })
  vi.stubGlobal('fetch', api)
  vi.stubGlobal('XMLHttpRequest', FakeStorage)
  const queryClient = new QueryClient()
  const options = avatarOptions(queryClient)

  const saved = await options.mutationFn(new File(['abcd'], 'me.png', { type: 'image/png' }))
  options.onSuccess(saved)

  const [create, , patch] = api.mock.calls.map(([request]) => request)
  expect(await create?.json()).toMatchObject({ purpose: 'avatar', mime: 'image/png' })
  expect(patch?.method).toBe('PATCH')
  expect(patch?.url).toMatch(/\/api\/v2\/users\/me$/)
  expect(await patch?.json()).toEqual({ avatar_upload_id: SLOT.id })
  expect(queryClient.getQueryData(myProfileQueryKey())).toMatchObject({ avatar_key: SLOT.key, version: 3 })
})
