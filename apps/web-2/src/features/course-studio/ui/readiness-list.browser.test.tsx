import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { createQueryClient } from '#/shared/api/query-client'
import type { ReadinessItem } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { readinessOptions } from '../queries'
import { ReadinessList } from './readiness-list'

const COURSE = '0190a5d2-0000-7000-8000-000000000001'
const drafts = Array.from({ length: 7 }, (_, index): ReadinessItem => ({
  code: 'activity-unpublished',
  activity_id: `0190a5d2-0000-7000-8000-00000000010${index}`,
  title: `topic ${index + 1}`,
}))

test('B-CST-48 seven drafts: one counted line, five links, «и ещё 2» to the content', async () => {
  const queryClient = createQueryClient(async () => undefined)
  queryClient.setQueryDefaults(readinessOptions(COURSE).queryKey, { staleTime: Infinity })
  queryClient.setQueryData(readinessOptions(COURSE).queryKey, { ready: true, blockers: [], warnings: drafts })
  const screen = await renderInRouter(
    <QueryClientProvider client={queryClient}>
      <Suspense>
        <ReadinessList courseId={COURSE} />
      </Suspense>
    </QueryClientProvider>,
  )
  await expect.element(screen.getByText(m.studio_readiness_activities_unpublished({ count: 7 }))).toBeVisible()
  expect(screen.getByRole('link', { name: /^topic/ }).elements()).toHaveLength(5)
  await expect
    .element(screen.getByRole('link', { name: m.studio_readiness_more({ count: 2 }) }))
    .toHaveAttribute('href', `/teach/courses/${COURSE}/content`)
})
