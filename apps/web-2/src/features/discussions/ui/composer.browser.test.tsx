import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { getCourseQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import { renderInRouter } from '#/shared/components/testing'

import { postsOptions } from '../queries'
import { Composer } from './composer'

const COURSE = '0190a5d2-0000-7000-8000-000000000031'

function render(archived: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(postsOptions(COURSE).queryKey, {
    pages: [{ items: [], next_cursor: null, can_post: false }],
    pageParams: [undefined],
  })
  client.setQueryData(getCourseQueryKey({ path: { course_id: COURSE } }), {
    id: COURSE,
    archived_at_unix: archived ? 1_790_000_000 : null,
  })
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <Composer courseId={COURSE} />
      </Suspense>
    </QueryClientProvider>,
  )
}

describe('Composer', () => {
  test('B-DSC-16 an archived course says its discussion is read-only, not "enrol to join"', async () => {
    const screen = await render(true)
    await expect.element(screen.getByText(m.discussions_archived())).toBeVisible()
    await expect.element(screen.getByText(m.discussions_members_only())).not.toBeInTheDocument()
  })

  test('B-DSC-14 a live course invites a non-member to enrol', async () => {
    const screen = await render(false)
    await expect.element(screen.getByText(m.discussions_members_only())).toBeVisible()
  })
})
