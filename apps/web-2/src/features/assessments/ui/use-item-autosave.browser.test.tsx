import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { SaveStatusContext } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { useItemAutosave } from './use-item-autosave'

const activityId = '0190a5d2-0000-7000-8000-000000000001'
const assessmentId = '0190a5d2-0000-7000-8000-000000000002'
const item: AssessmentItem = {
  id: '0190a5d2-0000-7000-8000-000000000003',
  title: 'Question',
  kind: 'open_text',
  body: { kind: 'open_text', prompt: '', min_words: null, rubric: null },
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  max_score: 1,
  position: 1,
  assessment_version: 1,
}

function Editor() {
  const save = useItemAutosave(activityId, assessmentId, item.id)
  return (
    <>
      <Button onClick={() => save.change({ title: crypto.randomUUID(), body: item.body, max_score: 1 })}>
        {m.assessments_field_title()}
      </Button>
      <Button onClick={save.invalid}>{m.validation_invalid()}</Button>
    </>
  )
}

let root: Root | null = null
afterEach(() => {
  root?.unmount()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

test.each([false, true])('B-ASM-10 switching during a save preserves the latest state (invalid: %s)', async invalid => {
  const requests: Request[] = []
  const replies: ((response: Response) => void)[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return new Promise<Response>(resolve => replies.push(resolve))
  })
  const report = vi.fn<(id: string, state: string, editorId?: string) => void>()
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <SaveStatusContext value={report}>
        <Editor />
      </SaveStatusContext>
    </QueryClientProvider>,
  )
  const edit = page.elementLocator(host).getByRole('button', { name: m.assessments_field_title() })
  await edit.click()
  await expect.poll(() => requests.length).toBe(1)
  await edit.click()
  if (invalid) await page.elementLocator(host).getByRole('button', { name: m.validation_invalid() }).click()
  if (!invalid) {
    root.unmount()
    root = null
  }
  replies[0]?.(Response.json({ ...item, assessment_version: 2 }))
  await expect.poll(() => requests.length).toBe(invalid ? 1 : 2)
  const bodies = await Promise.all(requests.map(request => request.clone().text()))
  expect(new Set(bodies).size).toBe(invalid ? 1 : 2)
  replies[1]?.(Response.json({ ...item, assessment_version: 3 }))
  await expect.poll(() => report.mock.calls.at(-1)).toEqual([activityId, invalid ? 'dirty' : 'saved', item.id])
})
