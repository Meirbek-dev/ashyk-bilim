import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { Notification, NotificationPage, UnreadCount } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { NotificationBell } from './notification-bell'

const COURSE = '0190a5d2-0000-7000-8000-00000000000c'
const update = (index: number): Notification => ({
  id: `0190a5d2-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
  type: 'course_update',
  payload: {
    type: 'course_update',
    course_id: COURSE,
    course_name: 'Алгебра',
    title: `Новость ${index}`,
    update_id: '0190a5d2-0000-7000-8000-000000000011',
  },
  created_at_unix: 1_700_000_000 - index,
  read_at_unix: null,
})

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** The API at the fetch boundary: the count, one page of the list, and "read all". */
function stubApi(count: number, items: Notification[]) {
  const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
    const { pathname } = new URL(request.url)
    if (pathname.endsWith('/read-all')) return json({ unread_count: 0 } satisfies UnreadCount)
    if (pathname.endsWith('/unread-count')) return json({ unread_count: count } satisfies UnreadCount)
    return json({ items, next_cursor: null } satisfies NotificationPage)
  })
  vi.stubGlobal('fetch', api)
  return api
}

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <NotificationBell />
      </Suspense>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

test('B-NOT-01 the bell shows the unread count from the server and names it; none shows no number', async () => {
  stubApi(140, [])
  const screen = await render()
  const bell = screen.getByRole('button', { name: m.notifications_bell_unread({ count: 140 }) })
  await expect.element(bell).toBeVisible()
  await expect.element(bell).toHaveTextContent('99+')

  stubApi(0, [])
  const quiet = await render()
  await expect.element(quiet.getByRole('button', { name: m.notifications_title() })).toHaveTextContent('')
})

test('B-NOT-02 the panel lists the five newest, reads them all and links to the whole list', async () => {
  const api = stubApi(6, [1, 2, 3, 4, 5, 6].map(update))
  const screen = await render()
  await screen.getByRole('button', { name: m.notifications_bell_unread({ count: 6 }) }).click()
  const panel = page.getByRole('dialog')
  await expect.element(panel.getByRole('heading', { name: m.notifications_latest() })).toBeVisible()
  await expect.element(panel.getByRole('link', { name: /Новость 5/ })).toBeVisible()
  await expect.element(panel.getByRole('link', { name: /Новость 6/ })).not.toBeInTheDocument()
  await expect
    .element(panel.getByRole('link', { name: m.notifications_all_link() }))
    .toHaveAttribute('href', '/notifications')

  await panel.getByRole('button', { name: m.notifications_mark_all() }).click()
  await expect.element(screen.getByRole('button', { name: m.notifications_title() })).toBeVisible()
  await expect.element(panel.getByText(m.notifications_new())).not.toBeInTheDocument()
  await expect.element(panel.getByRole('button', { name: m.notifications_mark_all() })).not.toBeInTheDocument()
  // The answer carried the count: no second read of it.
  const counts = api.mock.calls.filter(([request]) => request.url.endsWith('/unread-count'))
  expect(counts).toHaveLength(1)
})

test('B-NOT-02 with nothing yet the panel says so', async () => {
  stubApi(0, [])
  const screen = await render()
  await screen.getByRole('button', { name: m.notifications_title() }).click()
  await expect.element(page.getByRole('dialog').getByText(m.notifications_empty())).toBeVisible()
})
