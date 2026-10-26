import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'

import { StudioError } from './studio-error'

const courseId = '0190a5d2-0000-7000-8000-000000000061'
const forbidden = new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })

test('B-CST-12 a studio outside the caller team says so inside the focus frame, with the way back', async () => {
  const rootRoute = createRootRoute()
  const studio = createRoute({
    getParentRoute: () => rootRoute,
    path: '/teach/courses/$courseId/activities/$activityId',
    component: () => <StudioError error={forbidden} reset={() => {}} />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([studio]),
    history: createMemoryHistory({ initialEntries: [`/teach/courses/${courseId}/activities/a1`] }),
  })
  await router.load()
  const host = document.body.appendChild(document.createElement('div'))
  createRoot(host).render(<RouterProvider router={router} />)
  const screen = page.elementLocator(host)
  await expect.element(screen.getByRole('heading', { level: 1, name: m.studio_not_on_team_title() })).toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: m.platform_back_to_course() }))
    .toHaveAttribute('href', `/courses/${courseId}`)
  await expect.element(screen.getByRole('link', { name: m.studio_not_on_team_mine() })).toBeVisible()
})
