import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Activity } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { DeleteActivity } from './delete-activity'

const activity: Activity = {
  id: '0190a5d2-0000-7000-8000-000000000011',
  course_id: '0190a5d2-0000-7000-8000-000000000012',
  chapter_id: '0190a5d2-0000-7000-8000-000000000013',
  name: 'Quiz 1',
  activity_type: 'quiz',
  activity_sub_type: 'quiz_standard',
  allowed_actions: ['update', 'delete', 'move'],
  position: 1,
  published: true,
  version: 4,
}

const refusal = () =>
  Response.json(
    { type: 'about:blank', title: 'Conflict', status: 409, code: 'activity-has-learner-work', detail: 'learners' },
    { status: 409, headers: { 'content-type': 'application/problem+json' } },
  )

afterEach(() => vi.unstubAllGlobals())

async function open(row: Activity, reply: (request: Request) => Response) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return Promise.resolve(reply(request))
  })
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <DeleteActivity courseId={row.course_id} activity={row} />
    </QueryClientProvider>,
  )
  await screen.getByRole('button', { name: m.studio_delete_named({ name: row.name }) }).click()
  return { screen, requests }
}

describe('DeleteActivity: learner work is hidden, never deleted (owner decision 2026-10-14)', () => {
  test('a 409 from a stale view turns the dialog into «hide», which unpublishes', async () => {
    const { screen, requests } = await open(activity, request =>
      request.method === 'DELETE' ? refusal() : Response.json({ ...activity, published: false, version: 5 }),
    )
    await screen.getByRole('button', { name: m.studio_delete() }).click()
    const dialog = screen.getByRole('alertdialog', { name: m.studio_activity_locked_title({ name: activity.name }) })
    await expect.element(dialog).toHaveAccessibleDescription(m.studio_activity_locked_consequence())
    await dialog.getByRole('button', { name: m.studio_hide() }).click()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1]?.method).toBe('PATCH')
    expect(requests[1]?.headers.get('If-Match')).toBe('4')
    expect(await requests[1]?.clone().json()).toEqual({ published: false })
  })

  test('an already hidden one only explains: nothing to confirm', async () => {
    const hidden = { ...activity, published: false, allowed_actions: ['update' as const, 'move' as const] }
    const { screen, requests } = await open(hidden, refusal)
    const dialog = screen.getByRole('alertdialog', { name: m.studio_activity_locked_title({ name: hidden.name }) })
    await expect.element(dialog).toHaveAccessibleDescription(m.studio_activity_locked_hidden())
    await expect.element(dialog.getByRole('button', { name: m.studio_hide() })).not.toBeInTheDocument()
    await dialog.getByRole('button', { name: m.ui_close() }).click()
    expect(requests).toHaveLength(0)
  })
})
