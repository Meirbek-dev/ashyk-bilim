import { QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import type { SessionInfo } from '#/shared/api/gen/types.gen'
import { createQueryClient } from '#/shared/api/query-client'
import { sessionEnded, sessionOptions } from '#/shared/auth/session'

import { useLogout } from './use-logout'

const session: SessionInfo = {
  user_id: 'student',
  user: {
    id: 'student',
    username: 'student',
    display_name: 'Student',
    email: 'student@e2e.test',
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

function Menu() {
  useSuspenseQuery(sessionOptions())
  const logout = useLogout()
  return <Button onClick={logout}>{m.auth_logout()}</Button>
}

let root: Root | null = null

afterEach(() => {
  root?.unmount()
  root = null
  document.body.replaceChildren()
  sessionEnded.remove()
  vi.unstubAllGlobals()
})

test('a logout reply reaches the landing page after its menu has unmounted', async () => {
  const client = createQueryClient(async () => {})
  client.setQueryData(sessionOptions().queryKey, session)
  const route = createRootRoute({ component: Outlet })
  const routeTree = route.addChildren([
    createRoute({ getParentRoute: () => route, path: '/home', component: Menu }),
    createRoute({ getParentRoute: () => route, path: '/login' }),
    createRoute({ getParentRoute: () => route, path: '/' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/home'] }) })
  let finishLogout: ((response: Response) => void) | undefined
  const pendingReply = new Promise<Response>(resolve => {
    finishLogout = resolve
  })
  vi.stubGlobal('fetch', (request: Request) =>
    request.url.endsWith('/auth/logout')
      ? pendingReply
      : Promise.resolve(Response.json({ code: 'unauthenticated' }, { status: 401 })),
  )
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  root.render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await page.elementLocator(host).getByRole('button', { name: m.auth_logout() }).click()
  await router.navigate({ to: '/login' })
  await expect.element(page.elementLocator(host).getByRole('button', { name: m.auth_logout() })).not.toBeInTheDocument()
  sessionEnded.set(true)
  finishLogout?.(new Response(null, { status: 204 }))

  await expect.poll(() => router.state.location.pathname).toBe('/')
  expect(sessionEnded.get()).toBeNull()
  client.clear()
})
