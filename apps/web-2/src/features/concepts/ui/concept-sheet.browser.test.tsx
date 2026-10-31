import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { ConceptGraph } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { conceptRows, type ActivityInfo } from '../model/graph'
import { ConceptSheet } from './concept-sheet'
import { CreateConceptDialog } from './create-concept-dialog'

const courseId = '0190a5d2-0000-7000-8000-000000000001'
const ids = {
  fractions: '0190a5d2-0000-7000-8000-000000000010',
  decimals: '0190a5d2-0000-7000-8000-000000000011',
  lecture: '0190a5d2-0000-7000-8000-000000000020',
  quiz: '0190a5d2-0000-7000-8000-000000000021',
  tag: '0190a5d2-0000-7000-8000-000000000050',
}

const graph: ConceptGraph = {
  can_edit: true,
  latest_run_id: null,
  concepts: [
    {
      id: ids.fractions,
      name: 'Fractions',
      description: 'Parts',
      slug: 'fractions',
      origin: 'ai',
      position: 0,
      status: 'approved',
    },
    {
      id: ids.decimals,
      name: 'Decimals',
      description: '',
      slug: 'decimals',
      origin: 'ai',
      position: 1,
      status: 'approved',
    },
  ],
  prerequisites: [],
  tags: [
    {
      id: ids.tag,
      concept_id: ids.fractions,
      activity_id: ids.lecture,
      item_id: null,
      weight: 1,
      status: 'suggested',
      origin: 'ai',
      rationale: '',
    },
  ],
}
const activities: ActivityInfo[] = [
  { id: ids.lecture, name: 'Fractions lecture', activity_type: 'dynamic' },
  { id: ids.quiz, name: 'Fractions quiz', activity_type: 'quiz' },
]

afterEach(() => vi.unstubAllGlobals())

async function render(ui: ReactNode, reply: (request: Request) => Response = () => Response.json(graph)) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return Promise.resolve(reply(request))
  })
  await renderInRouter(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)
  return requests
}

const fractions = () => {
  const row = conceptRows(graph, activities).find(item => item.concept.id === ids.fractions)
  if (!row) throw new Error('no row')
  return row
}
const sheet = () => (
  <ConceptSheet courseId={courseId} graph={graph} row={fractions()} activities={activities} onClose={() => {}} />
)
const sent = async (request: Request | undefined) => ({
  method: request?.method,
  path: new URL(request?.url ?? '').pathname,
  body: await request
    ?.clone()
    .text()
    .then(text => (text ? JSON.parse(text) : undefined)),
})

describe('concept: create, rename, delete', () => {
  test('B-CON-05 «New concept» sends the name and the description', async () => {
    const requests = await render(<CreateConceptDialog courseId={courseId} />, () =>
      Response.json(graph.concepts[0], { status: 201 }),
    )
    await page.getByRole('button', { name: m.concepts_new() }).click()
    await page.getByLabelText(m.concepts_field_name()).fill('Ratios')
    await page.getByLabelText(m.concepts_field_description()).fill('Comparing two amounts')
    await page.getByRole('button', { name: m.concepts_create() }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(await sent(requests[0])).toEqual({
      method: 'POST',
      path: `/api/v2/courses/${courseId}/concepts`,
      body: { name: 'Ratios', description: 'Comparing two amounts' },
    })
  })

  test('B-CON-06 the sheet renames and describes the concept', async () => {
    const requests = await render(sheet())
    const name = page.getByLabelText(m.concepts_field_name())
    await expect.element(name).toHaveValue('Fractions')
    await name.fill('Common fractions')
    await page.getByRole('button', { name: m.concepts_save(), exact: true }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(await sent(requests[0])).toEqual({
      method: 'PATCH',
      path: `/api/v2/courses/${courseId}/concepts/${ids.fractions}`,
      body: { name: 'Common fractions', description: 'Parts' },
    })
  })

  test('B-CON-06 «Delete» asks with the name, then deletes the concept', async () => {
    const requests = await render(sheet(), () => new Response(null, { status: 204 }))
    await page.getByRole('button', { name: m.concepts_delete() }).click()
    const dialog = page.getByRole('alertdialog', { name: m.concepts_delete_title({ name: 'Fractions' }) })
    await dialog.getByRole('button', { name: m.concepts_delete() }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(await sent(requests[0])).toMatchObject({
      method: 'DELETE',
      path: `/api/v2/courses/${courseId}/concepts/${ids.fractions}`,
    })
  })
})

describe('concept: prerequisites and activities', () => {
  test('B-CON-07 a cycle is refused: the message stays under the prerequisites field', async () => {
    const requests = await render(sheet(), () =>
      Response.json(
        { type: 'about:blank', title: 'Conflict', status: 409, code: 'concept-cycle', detail: 'cycle' },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      ),
    )
    await page.getByLabelText(m.concepts_prerequisites_label()).click()
    await userEvent.keyboard('Dec')
    await page.getByRole('option', { name: 'Decimals' }).click()
    await userEvent.keyboard('{Escape}')
    await page.getByRole('button', { name: m.concepts_prerequisites_save() }).click()
    await expect.element(page.getByText(m.errors_concept_cycle())).toBeVisible()
    expect(await sent(requests[0])).toEqual({
      method: 'PUT',
      path: `/api/v2/courses/${courseId}/concepts/${ids.fractions}/prerequisites`,
      body: { requires: [ids.decimals] },
    })
  })

  test('B-CON-08 a suggested tag is approved; another activity is added with its weight', async () => {
    const requests = await render(sheet())
    await page.getByRole('button', { name: m.concepts_approve() }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(await sent(requests[0])).toEqual({
      method: 'PATCH',
      path: `/api/v2/courses/${courseId}/concept-tags/${ids.tag}`,
      body: { status: 'approved' },
    })
    // The lecture is already tagged as a whole: only the quiz is offered.
    await page.getByLabelText(m.concepts_tag_weight_label()).selectOptions('0.5')
    await page.getByRole('button', { name: m.concepts_tag_add() }).click()
    await expect.poll(() => requests.length).toBe(2)
    expect(await sent(requests[1])).toEqual({
      method: 'POST',
      path: `/api/v2/courses/${courseId}/concept-tags`,
      body: { concept_id: ids.fractions, activity_id: ids.quiz, weight: 0.5 },
    })
  })
})
