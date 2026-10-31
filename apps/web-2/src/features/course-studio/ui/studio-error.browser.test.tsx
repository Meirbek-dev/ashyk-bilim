import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'

import { courseOptions } from '../queries'
import { StudioError } from './studio-error'

const courseId = '0190a5d2-0000-7000-8000-000000000061'
const forbidden = new ApiError({ status: 403, code: 'forbidden', fieldErrors: [], requestId: null, retryAfter: null })

async function mount(error: ApiError, queryClient = new QueryClient()) {
  const rootRoute = createRootRoute()
  const studio = createRoute({
    getParentRoute: () => rootRoute,
    path: '/teach/courses/$courseId/activities/$activityId',
    component: () => <StudioError error={error} reset={() => {}} />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([studio]),
    history: createMemoryHistory({ initialEntries: [`/teach/courses/${courseId}/activities/a1`] }),
  })
  await router.load()
  const host = document.body.appendChild(document.createElement('div'))
  createRoot(host).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return page.elementLocator(host)
}

test('B-CST-12 a studio outside the caller team says so inside the focus frame, with the way back', async () => {
  const screen = await mount(forbidden)
  await expect.element(screen.getByRole('heading', { level: 1, name: m.studio_not_on_team_title() })).toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: m.platform_back_to_course() }))
    .toHaveAttribute('href', `/courses/${courseId}`)
  await expect.element(screen.getByRole('link', { name: m.studio_not_on_team_mine() })).toBeVisible()
})

// What the server answers a write on an archived course, and what the studio loader throws for it.
const archived = new ApiError({
  status: 409,
  code: 'course-archived',
  fieldErrors: [],
  requestId: null,
  retryAfter: null,
})
// What the refusing loader cached: an archived course and what the caller may still do with it.
const cached = (allowed_actions: string[]) => {
  const queryClient = new QueryClient()
  // A plain copy of the key: only the fields the screen reads, not a whole Course.
  queryClient.setQueryData([...courseOptions(courseId).queryKey], {
    id: courseId,
    archived_at_unix: 1,
    allowed_actions,
  })
  return queryClient
}

test('B-CST-12 an activity of an archived course tells its creator the course is archived, with the way to restore it', async () => {
  const screen = await mount(archived, cached(['restore', 'delete']))
  await expect
    .element(screen.getByRole('heading', { level: 1, name: m.studio_archived_activity_title() }))
    .toBeVisible()
  expect(screen.getByText(m.studio_not_on_team_title()).query()).toBeNull()
  await expect
    .element(screen.getByRole('link', { name: m.studio_archived_activity_restore() }))
    .toHaveAttribute('href', `/teach/courses/${courseId}/settings`)
  await expect
    .element(screen.getByRole('link', { name: m.platform_back_to_course() }))
    .toHaveAttribute('href', `/teach/courses/${courseId}/content`)
})

test('B-CST-12 a co-author of an archived course learns who can restore it, not that they are off the team', async () => {
  const screen = await mount(archived, cached([]))
  await expect.element(screen.getByText(m.studio_archived_course_text())).toBeVisible()
  expect(screen.getByText(m.studio_not_on_team_title()).query()).toBeNull()
  expect(screen.getByRole('link', { name: m.studio_archived_activity_restore() }).query()).toBeNull()
})
