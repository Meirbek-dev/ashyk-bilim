import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import { createQueryClient } from '#/shared/api/query-client'
import { renderInRouter } from '#/shared/components/testing'

import { EnrollLearners } from './enroll-learners'

const COURSE = '0190a5d2-0000-7000-8000-000000000061'

afterEach(() => vi.unstubAllGlobals())

describe('EnrollLearners', () => {
  test('B-CST-46 "Check the list" asks with dry_run and shows what enrolling would do', async () => {
    const api = vi.fn<(request: Request) => Promise<Response>>(async request => {
      const body: unknown = await request.clone().json()
      return Response.json({
        dry_run: typeof body === 'object' && body !== null && 'dry_run' in body,
        results: [
          { identifier: 'a@e2e.test', outcome: 'enrolled', user: null },
          { identifier: 'nobody@e2e.test', outcome: 'not_found', user: null },
        ],
      })
    })
    vi.stubGlobal('fetch', api)
    const screen = await renderInRouter(
      <QueryClientProvider client={createQueryClient(async () => undefined)}>
        <EnrollLearners courseId={COURSE} />
      </QueryClientProvider>,
    )
    await userEvent.fill(screen.getByRole('textbox', { name: m.studio_roster_field() }), 'a@e2e.test\nnobody@e2e.test')
    await userEvent.click(screen.getByRole('button', { name: m.studio_roster_check() }))
    await expect.element(screen.getByRole('heading', { name: m.studio_roster_preview() })).toBeVisible()
    // Nobody is enrolled by a check: the counts speak of what would happen.
    await expect.element(screen.getByText(`${m.studio_roster_outcome_will_enroll()}: 1`)).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: m.studio_roster_problems_preview() })).toBeVisible()
    const sent = api.mock.calls.at(-1)?.[0]
    expect(await sent?.json()).toEqual({ identifiers: ['a@e2e.test', 'nobody@e2e.test'], dry_run: true })
  })
})
