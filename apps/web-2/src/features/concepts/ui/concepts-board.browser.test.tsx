import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Activity, ClassMastery, ConceptGraph, Curriculum } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { classOptions, curriculumOptions, graphOptions } from '../queries'
import { ConceptsBoard } from './concepts-board'

const courseId = '0190a5d2-0000-7000-8000-000000000001'
const ids = {
  fractions: '0190a5d2-0000-7000-8000-000000000010',
  decimals: '0190a5d2-0000-7000-8000-000000000011',
  lecture: '0190a5d2-0000-7000-8000-000000000020',
  quiz: '0190a5d2-0000-7000-8000-000000000021',
  learner: '0190a5d2-0000-7000-8000-000000000030',
}

const activity = (id: string, name: string, type: Activity['activity_type']): Activity => ({
  id,
  name,
  activity_type: type,
  activity_sub_type: 'quiz_standard',
  allowed_actions: [],
  chapter_id: '0190a5d2-0000-7000-8000-000000000040',
  course_id: courseId,
  position: 0,
  published: true,
  version: 1,
})

const curriculum: Curriculum = {
  chapters: [
    {
      id: '0190a5d2-0000-7000-8000-000000000040',
      course_id: courseId,
      name: 'Numbers',
      description: '',
      position: 0,
      version: 1,
      allowed_actions: [],
      activities: [activity(ids.lecture, 'Fractions lecture', 'dynamic'), activity(ids.quiz, 'Fractions quiz', 'quiz')],
    },
  ],
}

const graph = (can_edit: boolean): ConceptGraph => ({
  can_edit,
  latest_run_id: null,
  concepts: [
    {
      id: ids.fractions,
      name: 'Fractions',
      description: 'Parts of a whole',
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
      status: 'suggested',
    },
  ],
  prerequisites: [{ concept_id: ids.decimals, requires_id: ids.fractions, status: 'suggested' }],
  tags: [
    {
      id: '0190a5d2-0000-7000-8000-000000000050',
      concept_id: ids.fractions,
      activity_id: ids.lecture,
      item_id: null,
      weight: 1,
      status: 'approved',
      origin: 'ai',
      rationale: '',
    },
    {
      id: '0190a5d2-0000-7000-8000-000000000051',
      concept_id: ids.decimals,
      activity_id: ids.quiz,
      item_id: '0190a5d2-0000-7000-8000-000000000060',
      weight: 0.5,
      status: 'suggested',
      origin: 'ai',
      rationale: '',
    },
  ],
})

const classMap: ClassMastery = {
  learners: 3,
  concepts: [
    {
      concept_id: ids.fractions,
      name: 'Fractions',
      mastered: 1,
      learning: 1,
      struggling: 1,
      not_started: 0,
      mean_p: 0.5,
      struggling_learners: [{ user_id: ids.learner, name: 'Aru Learner' }],
    },
  ],
}

const problem = (status: number, code: string) =>
  Response.json(
    { type: 'about:blank', title: 'Refused', status, code, detail: code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  )

afterEach(() => vi.unstubAllGlobals())

async function board(options: { canEdit: boolean; classMap?: ClassMastery; reply?: (request: Request) => Response }) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return Promise.resolve(options.reply?.(request) ?? problem(500, 'internal'))
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(graphOptions(courseId).queryKey, graph(options.canEdit))
  client.setQueryData(curriculumOptions(courseId).queryKey, curriculum)
  if (options.classMap) client.setQueryData(classOptions(courseId).queryKey, options.classMap)
  const screen = await renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <ConceptsBoard courseId={courseId} search={{ concept: undefined, learner: undefined }} onClose={() => {}} />
      </Suspense>
    </QueryClientProvider>,
  )
  return { screen, requests }
}

describe('ConceptsBoard', () => {
  test('B-CON-01 concepts with status, description, prerequisites and the activities that exercise them', async () => {
    const { screen } = await board({ canEdit: true, classMap })
    await expect.element(screen.getByRole('heading', { name: 'Decimals' })).toBeVisible()
    await expect.element(screen.getByText('Parts of a whole')).toBeVisible()
    await expect.element(screen.getByText(m.concepts_requires({ names: 'Fractions' }))).toBeVisible()
    await expect
      .element(screen.getByText(m.concepts_tag_question({ activity: 'Fractions quiz' }), { exact: false }))
      .toBeVisible()
    await expect.element(screen.getByText('Fractions lecture', { exact: false })).toBeVisible()
    // Suggested first: «Decimals» comes before «Fractions».
    const headings = screen
      .getByRole('article')
      .elements()
      .map(item => item.querySelector('h2')?.textContent)
    expect(headings).toEqual(['Decimals', 'Fractions'])
  })

  test('B-CON-02 without can_edit: no checkboxes, no concept links, no «Suggest» or «New concept»', async () => {
    const { screen } = await board({ canEdit: false, classMap })
    await expect.element(screen.getByRole('heading', { name: 'Fractions', level: 2 })).toBeVisible()
    await expect.element(screen.getByRole('checkbox')).not.toBeInTheDocument()
    await expect.element(screen.getByRole('link', { name: 'Fractions' })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: m.concepts_suggest() })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: m.concepts_new() })).not.toBeInTheDocument()
  })

  test('B-CON-03 «Suggest concepts» queues the mapper; a refusal shows its text and «Retry»', async () => {
    const { screen, requests } = await board({ canEdit: true, classMap, reply: () => problem(503, 'ai-disabled') })
    await screen.getByRole('button', { name: m.concepts_suggest() }).click()
    await expect.element(screen.getByText(m.errors_ai_disabled())).toBeVisible()
    await expect.element(screen.getByRole('button', { name: m.ui_retry() })).toBeVisible()
    expect(requests[0]?.method).toBe('POST')
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(`/api/v2/courses/${courseId}/concepts/suggest`)
  })

  test('B-CON-04 the selected concepts are approved in one request and the selection clears', async () => {
    const { screen, requests } = await board({
      canEdit: true,
      classMap,
      reply: () =>
        Response.json({ ...graph(true), concepts: graph(true).concepts.map(c => ({ ...c, status: 'approved' })) }),
    })
    await screen.getByRole('checkbox', { name: m.concepts_select({ name: 'Decimals' }) }).click()
    await screen.getByRole('checkbox', { name: m.concepts_select({ name: 'Fractions' }) }).click()
    await expect.element(screen.getByText(m.concepts_selected({ count: '2' }))).toBeVisible()
    await screen.getByRole('button', { name: m.concepts_approve() }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(new URL(requests[0]?.url ?? '').pathname).toBe(`/api/v2/courses/${courseId}/concepts/review`)
    expect(await requests[0]?.clone().json()).toEqual({
      status: 'approved',
      concept_ids: [ids.decimals, ids.fractions],
    })
    await expect.element(screen.getByText(m.concepts_selected({ count: '2' }))).not.toBeInTheDocument()
  })

  test('B-CON-09 the class map: levels per concept and who is behind, linked to the learner', async () => {
    const { screen } = await board({ canEdit: true, classMap })
    await expect.element(screen.getByText(m.concepts_class_learners({ count: '3' }))).toBeVisible()
    await expect.element(screen.getByRole('link', { name: 'Aru Learner' }).first()).toBeInTheDocument()
  })

  test('B-CON-09 with the feature off the map is one quiet line and the list stays', async () => {
    const { screen } = await board({ canEdit: true, reply: () => problem(503, 'ai-disabled') })
    await expect.element(screen.getByText(m.concepts_class_off())).toBeVisible()
    await expect.element(screen.getByRole('heading', { name: 'Decimals', level: 2 })).toBeVisible()
  })
})
