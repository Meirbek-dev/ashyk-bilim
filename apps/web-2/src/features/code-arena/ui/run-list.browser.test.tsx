import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { CodeRun } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { myRunsOptions } from '../queries'
import { RunList } from './run-list'

const ITEM = '0190a5d2-0000-7000-8000-0000000000c1'
const run = (n: number): CodeRun => ({
  id: `0190a5d2-0000-7000-8000-00000000010${n.toString(16)}`,
  assessment_id: '0190a5d2-0000-7000-8000-0000000000a1',
  item_id: ITEM,
  cases: [],
  compile_output: null,
  created_at_unix: 1_760_000_000 - n * 60,
  error_message: null,
  finished_at_unix: 1_760_000_000 - n * 60,
  language_id: 71,
  passed: 1,
  total: 1,
  purpose: 'visible',
  replayed: false,
  score: null,
  status: 'accepted',
  submission_id: null,
})

test('B-COD-28 a dozen runs: the latest five, the rest behind «Show more»', async () => {
  const client = new QueryClient()
  client.setQueryData(
    myRunsOptions(ITEM).queryKey,
    Array.from({ length: 12 }, (_, n) => run(n)),
  )
  const screen = await renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <RunList itemId={ITEM} selected={undefined} />
      </Suspense>
    </QueryClientProvider>,
  )
  const rows = screen.getByRole('listitem')
  await expect.element(rows.first()).toBeInTheDocument()
  expect(rows.elements()).toHaveLength(5)
  await screen.getByRole('button', { name: m.ui_show_more() }).click()
  await expect.poll(() => rows.elements().length).toBe(12)
})
