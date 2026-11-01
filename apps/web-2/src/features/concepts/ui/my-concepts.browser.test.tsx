import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import { m } from '#/paraglide/messages'
import type { LearnerMastery, LearnerMasteryDetail, ScopeCapabilities } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { CourseSearch } from './course-search'
import { LearnerSheet } from './learner-sheet'
import { MyConcepts } from './my-concepts'

const courseId = '0190a5d2-0000-7000-8000-000000000001'
const userId = '0190a5d2-0000-7000-8000-000000000030'
const quiz = { id: '0190a5d2-0000-7000-8000-000000000021', name: 'Fractions quiz' }

const mastery: LearnerMastery = {
  user_id: userId,
  concepts: [
    {
      concept_id: '0190a5d2-0000-7000-8000-000000000010',
      name: 'Fractions',
      level: 'mastered',
      p_known: 0.9,
      evidence_count: 4,
      last_observed_at: 1_760_000_000,
      review: [],
      stale: false,
    },
    {
      concept_id: '0190a5d2-0000-7000-8000-000000000011',
      name: 'Decimals',
      level: 'struggling',
      p_known: 0.2,
      evidence_count: 2,
      last_observed_at: 1_750_000_000,
      review: [quiz],
      stale: true,
    },
  ],
}

afterEach(() => vi.unstubAllGlobals())

// What the block asked the server; its reads have settled when `settled()` turns true.
let asked: string[] = []
let client = new QueryClient()
const settled = () => asked.length > 0 && client.isFetching() === 0

async function render(reply: (request: Request) => Response, ui = <MyConcepts courseId={courseId} />) {
  asked = []
  vi.stubGlobal('fetch', (request: Request) => {
    asked.push(new URL(request.url).pathname)
    return Promise.resolve(reply(request))
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await renderInRouter(
    <QueryClientProvider client={client}>
      <p>{m.concepts_title()}</p>
      {ui}
    </QueryClientProvider>,
  )
  // The page around the block renders either way.
  await expect.element(host.getByText(m.concepts_title())).toBeVisible()
  return host
}

describe('MyConcepts', () => {
  test('B-CON-11 levels, the weak first, the stale marker and what to review as player links', async () => {
    const screen = await render(() => Response.json(mastery))
    await expect.element(screen.getByRole('heading', { name: m.concepts_mine_title() })).toBeVisible()
    const items = screen.getByRole('listitem')
    await expect.poll(() => items.first().element().textContent).toMatch(/^Decimals/)
    const weakest = items.first().element().textContent
    expect(weakest).toContain(m.concepts_level_struggling())
    expect(weakest).toContain(m.concepts_stale())
    await expect
      .element(screen.getByRole('link', { name: quiz.name }))
      .toHaveAttribute('href', `/learn/${courseId}/${quiz.id}`)
    expect(items.last().element().textContent).toContain(m.concepts_level_mastered())
  })

  test('B-CON-11 no concepts: no block', async () => {
    const screen = await render(() => Response.json({ user_id: userId, concepts: [] }))
    await expect.element(screen.getByRole('heading', { name: m.concepts_mine_title() })).not.toBeInTheDocument()
  })

  test('B-CON-11 the feature off (ai-disabled): no block and no error', async () => {
    const screen = await render(() =>
      Response.json(
        { type: 'about:blank', title: 'Unavailable', status: 503, code: 'ai-disabled', detail: 'off' },
        { status: 503, headers: { 'content-type': 'application/problem+json' } },
      ),
    )
    await expect.element(screen.getByRole('heading', { name: m.concepts_mine_title() })).not.toBeInTheDocument()
    await expect.element(screen.getByText(m.errors_ai_disabled())).not.toBeInTheDocument()
  })
})

describe('LearnerSheet', () => {
  test('B-CON-10 a learner of the class map: their concepts, the weak first', async () => {
    const detail: LearnerMasteryDetail = {
      learner: { user_id: userId, name: 'Aru Learner' },
      concepts: mastery.concepts,
      evidence: [],
    }
    await render(() => Response.json(detail), <LearnerSheet courseId={courseId} userId={userId} onClose={() => {}} />)
    const dialog = page.getByRole('dialog', { name: m.concepts_learner_title() })
    await expect.element(dialog.getByText('Aru Learner')).toBeVisible()
    await expect.poll(() => dialog.getByRole('listitem').first().element().textContent).toMatch(/^Decimals/)
  })
})

// The course page's AI capabilities (the panel's query) decide whether the search box is there at all.
const capabilities = (search: boolean): ScopeCapabilities => ({
  available: true,
  context: null,
  context_visibility: 'student',
  features: [{ key: 'semantic_search_enabled', enabled: search, reason: search ? null : 'disabled' }],
  modes: ['ask'],
  reason: null,
  restricted: false,
  role: 'student',
  surface: 'course-page',
})
const aiOff = () =>
  Response.json(
    { type: 'about:blank', title: 'Unavailable', status: 503, code: 'ai-disabled', detail: 'off' },
    { status: 503, headers: { 'content-type': 'application/problem+json' } },
  )
const searchReply = (search: boolean, reply: () => Response) => (request: Request) =>
  new URL(request.url).pathname.includes('/ai/capabilities/scope/') ? Response.json(capabilities(search)) : reply()

describe('CourseSearch', () => {
  test('B-CON-12 the passages found: where they are, linked into the player, and the passage', async () => {
    const hit = {
      chunk_id: '0190a5d2-0000-7000-8000-000000000070',
      activity_id: quiz.id,
      label: 'Fractions quiz › Halves',
      excerpt: 'A half is one of two equal parts.',
      anchor: {},
      score: 0.9,
      source_id: quiz.id,
      source_type: 'activity',
    }
    const screen = await render(
      searchReply(true, () => Response.json([hit])),
      <CourseSearch courseId={courseId} />,
    )
    await screen.getByRole('searchbox', { name: m.concepts_search_label() }).fill('half')
    await screen.getByRole('button', { name: m.concepts_search_submit() }).click()
    await expect
      .element(screen.getByRole('link', { name: hit.label }))
      .toHaveAttribute('href', `/learn/${courseId}/${quiz.id}`)
    await expect.element(screen.getByText(hit.excerpt)).toBeVisible()
  })

  test('B-CON-12 without semantic_search_enabled in the capabilities there is no search box', async () => {
    const screen = await render(searchReply(false, aiOff), <CourseSearch courseId={courseId} />)
    await expect.poll(settled).toBe(true)
    expect(asked).toEqual([`/api/v2/ai/capabilities/scope/${courseId}`])
    await expect.element(screen.getByRole('heading', { name: m.concepts_search_title() })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('searchbox')).not.toBeInTheDocument()
  })

  test('B-CON-12 capabilities that cannot load: no search box and no error', async () => {
    const screen = await render(aiOff, <CourseSearch courseId={courseId} />)
    await expect.poll(settled).toBe(true)
    await expect.element(screen.getByRole('searchbox')).not.toBeInTheDocument()
    await expect.element(screen.getByText(m.errors_ai_disabled())).not.toBeInTheDocument()
  })

  test('B-CON-12 switched off after the capabilities were read: one quiet line on a search, no error', async () => {
    const screen = await render(searchReply(true, aiOff), <CourseSearch courseId={courseId} />)
    await screen.getByRole('searchbox', { name: m.concepts_search_label() }).fill('half')
    await screen.getByRole('button', { name: m.concepts_search_submit() }).click()
    await expect.element(screen.getByText(m.concepts_search_off())).toBeVisible()
    await expect.element(screen.getByText(m.errors_ai_disabled())).not.toBeInTheDocument()
  })
})
