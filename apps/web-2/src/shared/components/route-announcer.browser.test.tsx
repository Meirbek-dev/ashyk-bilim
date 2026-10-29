import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { RouteAnnouncer } from './route-announcer'

const titles = { users: 'Пользователи', roles: 'Роли' }

function Titled({ title }: { title: string }) {
  useEffect(() => {
    document.title = title
  }, [title])
  return <h1>{title}</h1>
}

test('an in-app navigation says the new page title; the first load and a search change say nothing', async () => {
  // The region lives in a closed shadow root: the test keeps the root the component attaches.
  const attachShadow = vi.spyOn(Element.prototype, 'attachShadow')
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <RouteAnnouncer />
      </>
    ),
  })
  const users = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users',
    component: () => <Titled title={titles.users} />,
  })
  const roles = createRoute({
    getParentRoute: () => rootRoute,
    path: '/roles',
    component: () => <Titled title={titles.roles} />,
  })
  const history = createMemoryHistory({ initialEntries: ['/users'] })
  const router = createRouter({ routeTree: rootRoute.addChildren([users, roles]), history })
  await router.load()
  const host = document.body.appendChild(document.createElement('div'))
  createRoot(host).render(<RouterProvider router={router} />)
  const screen = page.elementLocator(host)
  await expect.element(screen.getByRole('heading', { name: titles.users })).toBeVisible()
  await expect.poll(() => attachShadow.mock.results.length).toBe(1)
  const root: ShadowRoot | undefined = attachShadow.mock.results[0]?.value
  const region = root?.querySelector('[aria-live]')
  expect(region?.textContent).toBe('')
  history.push('/users?q=a')
  await expect.element(screen.getByRole('heading', { name: titles.users })).toBeVisible()
  expect(region?.textContent).toBe('')
  history.push('/roles')
  await expect.poll(() => region?.textContent).toBe(titles.roles)
  // Outside the page's own text: a lookup of the title still finds one element, the heading.
  await expect.element(screen.getByText(titles.roles)).toBeVisible()
})
