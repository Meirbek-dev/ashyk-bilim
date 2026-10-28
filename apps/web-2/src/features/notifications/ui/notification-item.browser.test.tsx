import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Notification, UnreadCount } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { NotificationItem } from './notification-item'

const notification: Notification = {
  id: '0190a5d2-0000-7000-8000-000000000101',
  type: 'course_update',
  payload: {
    type: 'course_update',
    course_id: '0190a5d2-0000-7000-8000-00000000000c',
    course_name: 'Алгебра',
    title: 'Новость',
    update_id: '0190a5d2-0000-7000-8000-000000000011',
  },
  created_at_unix: 1_700_000_000,
  read_at_unix: null,
}

afterEach(() => vi.unstubAllGlobals())

test('«Отметить прочитанным» leaves the keyboard on its row, not at the top of the page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ unread_count: 0 } satisfies UnreadCount), {
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationItem notification={notification} />
    </QueryClientProvider>,
  )
  await screen.getByRole('button', { name: m.notifications_mark_read() }).click()
  await expect.element(screen.getByRole('link')).toHaveFocus()
})
