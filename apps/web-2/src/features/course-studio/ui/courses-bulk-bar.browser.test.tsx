import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Course, CourseDeletionPreview } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { CoursesBulkBar } from './courses-bulk-bar'

const course = (n: number): Course => ({
  id: `0190a5d2-0000-7000-8000-00000000001${n}`,
  name: `Course ${n}`,
  about: '',
  description: '',
  allowed_actions: ['update', 'delete'],
  archived_at_unix: null,
  archived_by: null,
  assessments_require_enrollment: true,
  contributor_ids: [],
  created_at_unix: 1_760_000_000,
  creator_id: null,
  learnings: [],
  open_to_contributors: false,
  public: false,
  tags: [],
  thumbnail_key: null,
  thumbnail_video_key: null,
  updated_at_unix: 1_760_000_000,
  version: n,
})
const courses = [course(1), course(2)]

afterEach(() => vi.unstubAllGlobals())

/** Each course answers its own deletion preview (`null`: the preview fails); a delete answers 204. */
async function openDelete(previews: (CourseDeletionPreview | null)[]) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    if (request.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
    const preview = previews[courses.findIndex(one => request.url.includes(one.id))]
    return Promise.resolve(
      preview
        ? Response.json(preview)
        : Response.json(
            { type: 'about:blank', title: 'Internal', status: 500, code: 'internal', detail: 'x' },
            { status: 500, headers: { 'content-type': 'application/problem+json' } },
          ),
    )
  })
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <CoursesBulkBar selected={courses} onDone={() => {}} />
    </QueryClientProvider>,
  )
  await screen.getByRole('button', { name: `${m.studio_bulk_delete()} (2)` }).click()
  const dialog = screen.getByRole('alertdialog', {
    name: m.studio_bulk_confirm({ action: m.studio_bulk_delete(), count: '2' }),
  })
  const deletes = () => requests.filter(request => request.method === 'DELETE')
  return { dialog, deletes }
}

describe('CoursesBulkBar: deleting courses with learner work', () => {
  test('B-CST-45 the summed counts and the box; every delete carries the acknowledgement once ticked', async () => {
    const { dialog, deletes } = await openDelete([
      { learners: 2, submissions: 5, file_attempts: 1, certificates: 0 },
      { learners: 1, submissions: 0, file_attempts: 0, certificates: 3 },
    ])
    await expect.element(dialog.getByText(m.studio_course_delete_work_learners({ count: '3' }))).toBeVisible()
    await expect.element(dialog.getByText(m.studio_course_delete_work_certificates({ count: '3' }))).toBeVisible()
    const confirm = dialog.getByRole('button', { name: m.studio_bulk_delete() })
    await expect.element(confirm).toBeDisabled()
    await dialog.getByRole('checkbox', { name: m.studio_course_delete_acknowledge() }).click()
    await confirm.click()
    await expect.poll(() => deletes().length).toBe(2)
    for (const request of deletes())
      expect(new URL(request.url).searchParams.get('acknowledge_learner_work')).toBe('true')
  })

  test('B-CST-45 no work (a failed preview counts as none): no box, no acknowledgement sent', async () => {
    const { dialog, deletes } = await openDelete([
      { learners: 0, submissions: 0, file_attempts: 0, certificates: 0 },
      null,
    ])
    const confirm = dialog.getByRole('button', { name: m.studio_bulk_delete() })
    await expect.element(confirm).toBeEnabled()
    await expect.element(dialog.getByRole('checkbox')).not.toBeInTheDocument()
    await confirm.click()
    await expect.poll(() => deletes().length).toBe(2)
    for (const request of deletes())
      expect(new URL(request.url).searchParams.has('acknowledge_learner_work')).toBe(false)
  })
})
