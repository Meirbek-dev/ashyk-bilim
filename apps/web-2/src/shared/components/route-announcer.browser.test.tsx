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

function Titled({ title }: { title: string }) {
  useEffect(() => {
    document.title = title
  }, [title])
  return <h1>{title}</h1>
}

test('an in-app navigation says the new page title; the first load and a search change say nothing', async () => {
  // The region lives in a closed shadow root: the test keeps the root the component attaches.
  const roots: ShadowRoot[] = []
  const attach = Element.prototype.attachShadow
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
    const root = attach.call(this, init)
    roots.push(root)
    return root
  })
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
    component: () => <Titled title="Пользователи" />,
  })
  const roles = createRoute({
    getParentRoute: () => rootRoute,
    path: '/roles',
    component: () => <Titled title="Роли" />,
  })
  const history = createMemoryHistory({ initialEntries: ['/users'] })
  const router = createRouter({ routeTree: rootRoute.addChildren([users, roles]), history })
  await router.load()
  const host = document.body.appendChild(document.createElement('div'))
  createRoot(host).render(<RouterProvider router={router} />)
  const screen = page.elementLocator(host)
  await expect.element(screen.getByRole('heading', { name: 'Пользователи' })).toBeVisible()
  await expect.poll(() => roots.length).toBe(1)
  const region = roots[0]?.querySelector('[aria-live]')
  expect(region?.textContent).toBe('')
  history.push('/users?q=a')
  await expect.element(screen.getByRole('heading', { name: 'Пользователи' })).toBeVisible()
  expect(region?.textContent).toBe('')
  history.push('/roles')
  await expect.poll(() => region?.textContent).toBe('Роли')
  // Outside the page's own text: a lookup of the title still finds one element, the heading.
  await expect.element(screen.getByText('Роли')).toBeVisible()
})
