import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { activityOptions } from '../curriculum-queries'
import { SaveStatusContext, type SaveState } from './save-status'
import { useAutosave } from './use-autosave'

const activity: ActivityDetail = {
  id: '0190a5d2-0000-7000-8000-000000000001',
  course_id: '0190a5d2-0000-7000-8000-000000000002',
  chapter_id: '0190a5d2-0000-7000-8000-000000000003',
  name: 'Page',
  activity_type: 'dynamic',
  activity_sub_type: 'dynamic_page',
  allowed_actions: ['update'],
  position: 1,
  published: false,
  version: 1,
  content: { type: 'doc', content: [] },
  details: {},
  settings: {},
}

function Editor() {
  const save = useAutosave(activity.course_id, activity)
  return (
    <Button
      onClick={() =>
        save.change({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: crypto.randomUUID() }] }],
        })
      }
    >
      {m.studio_update_edit()}
    </Button>
  )
}

let root: Root | null = null
afterEach(() => {
  root?.unmount()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

test('B-CST-11 the latest edit queued during a save survives leaving the editor', async () => {
  const requests: Request[] = []
  const replies: ((response: Response) => void)[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return new Promise<Response>(resolve => replies.push(resolve))
  })
  const client = new QueryClient()
  client.setQueryData(activityOptions(activity.id).queryKey, activity)
  const report = vi.fn<(id: string, state: SaveState) => void>()
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  root.render(
    <QueryClientProvider client={client}>
      <SaveStatusContext value={report}>
        <Editor />
      </SaveStatusContext>
    </QueryClientProvider>,
  )
  const screen = page.elementLocator(host)
  const edit = screen.getByRole('button', { name: m.studio_update_edit() })
  await edit.click()
  await expect.poll(() => requests.length).toBe(1)
  await edit.click()
  root.unmount()
  root = null
  replies[0]?.(Response.json({ ...activity, version: 2 }))
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]?.headers.get('If-Match')).toBe('2')
  expect(await requests[1]?.clone().json()).not.toEqual(await requests[0]?.clone().json())
  replies[1]?.(Response.json({ ...activity, version: 3 }))
  await expect.poll(() => report.mock.calls.at(-1)).toEqual([activity.id, 'saved'])
})
