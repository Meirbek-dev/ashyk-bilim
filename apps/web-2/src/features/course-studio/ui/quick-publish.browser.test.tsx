import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Activity } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { QuickPublish } from './quick-publish'

const lesson: Activity = {
  id: '0190a5d2-0000-7000-8000-000000000021',
  course_id: '0190a5d2-0000-7000-8000-000000000022',
  chapter_id: '0190a5d2-0000-7000-8000-000000000023',
  name: 'Lesson 1',
  activity_type: 'video',
  activity_sub_type: 'video_hosted',
  allowed_actions: ['update', 'delete', 'move'],
  position: 1,
  published: false,
  version: 3,
}

afterEach(() => vi.unstubAllGlobals())

async function show(row: Activity, reply: (request: Request) => Response = () => Response.json(row)) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return Promise.resolve(reply(request))
  })
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <QuickPublish courseId={row.course_id} activity={row} />
    </QueryClientProvider>,
  )
  return { screen, requests }
}

describe('QuickPublish', () => {
  test('B-CST-06 a draft lesson publishes from its row: one PATCH under the row version', async () => {
    const { screen, requests } = await show(lesson, () => Response.json({ ...lesson, published: true, version: 4 }))
    await screen.getByRole('button', { name: m.studio_publish_named({ name: lesson.name }) }).click()
    await expect.poll(() => requests.length).toBeGreaterThan(0)
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.headers.get('If-Match')).toBe('3')
    expect(await requests[0]?.clone().json()).toEqual({ published: true })
  })

  test('B-CST-06 a video lesson without its video is refused next to the button, as in the studio', async () => {
    const { screen } = await show(lesson, () =>
      Response.json(
        { type: 'about:blank', title: 'Conflict', status: 409, code: 'activity-media-missing', detail: 'no media' },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      ),
    )
    await screen.getByRole('button', { name: m.studio_publish_named({ name: lesson.name }) }).click()
    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.studio_publish_needs_video())
  })

  test.each([
    { ...lesson, activity_type: 'quiz' as const, activity_sub_type: 'quiz_standard' as const },
    { ...lesson, published: true },
    { ...lesson, allowed_actions: [] },
  ])('B-CST-06 a quiz, a published lesson or a read-only row get no button (%#)', async row => {
    const { screen } = await show(row)
    await expect.element(screen.getByRole('button')).not.toBeInTheDocument()
  })
})
