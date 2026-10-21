import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { createQueryClient } from '#/shared/api/query-client'
import { renderInRouter } from '#/shared/components/testing'

import { LinkGroups } from './link-groups'

afterEach(() => vi.unstubAllGlobals())

test('B-CST-50 with no group at all the section leads to making one', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ items: [], next_cursor: null, total: 0 })),
  )
  const screen = await renderInRouter(
    <QueryClientProvider client={createQueryClient(async () => undefined)}>
      <Suspense>
        <LinkGroups courseId="0190a5d2-0000-7000-8000-000000000061" linked={[]} groupPages />
      </Suspense>
    </QueryClientProvider>,
  )
  await expect
    .element(screen.getByRole('link', { name: m.studio_groups_create() }))
    .toHaveAttribute('href', '/teach/groups')
})
