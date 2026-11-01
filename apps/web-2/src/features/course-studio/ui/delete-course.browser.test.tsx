import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Course, CourseDeletionPreview } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { deletionPreviewOptions } from '../queries'
import { DeleteCourse } from './delete-course'

const course: Course = {
  id: '0190a5d2-0000-7000-8000-000000000012',
  name: 'Python basics',
  about: '',
  description: '',
  allowed_actions: ['update', 'archive', 'delete'],
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
  version: 7,
}

const none: CourseDeletionPreview = { learners: 0, submissions: 0, file_attempts: 0, certificates: 0 }
const work: CourseDeletionPreview = { learners: 3, submissions: 12, file_attempts: 4, certificates: 2 }

const refusal = () =>
  Response.json(
    {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'course-has-learner-work',
      detail: 'learners',
      details: work,
    },
    { status: 409, headers: { 'content-type': 'application/problem+json' } },
  )

afterEach(() => vi.unstubAllGlobals())

/** The settings loader has read the preview (`cached`); opening the dialog reads it again (`previews` in turn). */
async function open(cached: CourseDeletionPreview, previews: CourseDeletionPreview[], remove: () => Response) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    if (request.method === 'DELETE') return Promise.resolve(remove())
    return Promise.resolve(Response.json(previews.shift() ?? cached))
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(deletionPreviewOptions(course.id).queryKey, cached)
  const screen = await renderInRouter(
    <QueryClientProvider client={client}>
      <DeleteCourse course={course} />
    </QueryClientProvider>,
  )
  await screen.getByRole('button', { name: m.studio_course_delete() }).click()
  const dialog = screen.getByRole('alertdialog', { name: m.studio_course_delete_confirm_title({ name: course.name }) })
  await dialog.getByRole('textbox', { name: m.studio_course_delete_name() }).fill(course.name)
  return { dialog, requests, deletes: () => requests.filter(request => request.method === 'DELETE') }
}

describe('DeleteCourse: learner work goes with the course only when acknowledged (owner decision 2026-11-01)', () => {
  test('B-CST-52 learner work: the counts, a required box, and the request carries the acknowledgement', async () => {
    const { dialog, deletes } = await open(none, [work], () => new Response(null, { status: 204 }))
    await expect.element(dialog.getByText(m.studio_course_delete_work_title())).toBeVisible()
    await expect.element(dialog.getByText(m.studio_course_delete_work_learners({ count: '3' }))).toBeVisible()
    await expect.element(dialog.getByText(m.studio_course_delete_work_submissions({ count: '12' }))).toBeVisible()
    await expect.element(dialog.getByText(m.studio_course_delete_work_files({ count: '4' }))).toBeVisible()
    await expect.element(dialog.getByText(m.studio_course_delete_work_certificates({ count: '2' }))).toBeVisible()
    const submit = dialog.getByRole('button', { name: m.studio_course_delete() })
    await expect.element(submit).toBeDisabled()
    await dialog.getByRole('checkbox', { name: m.studio_course_delete_acknowledge() }).click()
    await expect.element(submit).toBeEnabled()
    await submit.click()
    await expect.poll(() => deletes().length).toBe(1)
    const sent = deletes()[0]
    expect(new URL(sent?.url ?? '').searchParams.get('acknowledge_learner_work')).toBe('true')
    expect(sent?.headers.get('If-Match')).toBe('7')
  })

  test('B-CST-52 no learner work: the dialog as before, no box, no acknowledgement sent', async () => {
    const { dialog, deletes } = await open(none, [none], () => new Response(null, { status: 204 }))
    await expect.element(dialog.getByRole('checkbox')).not.toBeInTheDocument()
    await expect.element(dialog.getByText(m.studio_course_delete_work_title())).not.toBeInTheDocument()
    await dialog.getByRole('button', { name: m.studio_course_delete() }).click()
    await expect.poll(() => deletes().length).toBe(1)
    expect(new URL(deletes()[0]?.url ?? '').searchParams.has('acknowledge_learner_work')).toBe(false)
  })

  test('B-CST-53 work that arrived after the preview: the 409 reads it again and the box appears', async () => {
    const { dialog, deletes } = await open(none, [none, work], refusal)
    await dialog.getByRole('button', { name: m.studio_course_delete() }).click()
    await expect.poll(() => deletes().length).toBe(1)
    await expect.element(dialog.getByText(m.errors_course_has_learner_work())).toBeVisible()
    await expect.element(dialog.getByRole('checkbox', { name: m.studio_course_delete_acknowledge() })).toBeVisible()
    await expect.element(dialog.getByRole('button', { name: m.studio_course_delete() })).toBeDisabled()
  })
})
