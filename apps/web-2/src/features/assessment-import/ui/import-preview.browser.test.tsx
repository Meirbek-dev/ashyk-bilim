import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AssessmentImport, CurriculumChapter } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { ImportPreview } from './import-preview'

const chapter: CurriculumChapter = {
  id: 'ch-1',
  course_id: 'c-1',
  name: 'Неделя 1',
  description: '',
  position: 1,
  version: 1,
  allowed_actions: ['add_activity'],
  activities: [],
}

const ready: AssessmentImport = {
  id: 'imp-1',
  course_id: 'c-1',
  status: 'ready',
  file_name: 'Java.xlsx',
  sheet: 'Тест',
  unescape_newlines: true,
  settings: {
    title: 'Java',
    max_attempts: 3,
    time_limit_seconds: 600,
    draw_count: null,
    leveling: false,
    draw_strata: [],
  },
  summary: {
    questions: 2,
    single: 1,
    multiple: 0,
    short: 1,
    matching: 0,
    essay: 0,
    images: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
  },
  items: [
    {
      row: 2,
      kind: 'choice',
      title: 'Q1',
      max_score: 1,
      draw_group: null,
      body: {
        kind: 'choice',
        explanation: null,
        variant: null,
        prompt: 'for (int i = 0;\n  i < 3; i++)',
        prompt_format: 'plain',
        options: [
          { id: 'o1', text: '3' },
          { id: 'o2', text: '4', is_correct: true },
        ],
      },
    },
    {
      row: 3,
      kind: 'open_text',
      title: 'Q2',
      max_score: 1,
      draw_group: null,
      body: { kind: 'open_text', min_words: null, rubric: null, short_answer: true, accepted_answers: ['42'] },
    },
  ],
  issues: [],
  issues_truncated: 0,
  result: null,
  created_at_unix: 0,
  expires_at_unix: 0,
}

const invalid: AssessmentImport = {
  ...ready,
  status: 'invalid',
  summary: { ...ready.summary, errors: 2 },
  issues: [
    { severity: 'error', code: 'no_options', cell: 'E3', row: 3, params: {} },
    { severity: 'error', code: 'type_invalid', cell: 'B5', row: 5, params: {} },
  ],
}

afterEach(() => vi.unstubAllGlobals())

async function render(imported: AssessmentImport, reply?: (request: Request) => Response) {
  const requests: Request[] = []
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request)
    return Promise.resolve(reply?.(request) ?? Response.json({}))
  })
  const screen = await renderInRouter(
    <QueryClientProvider client={new QueryClient()}>
      <ImportPreview
        courseId="c-1"
        imported={imported}
        destination={{ into: 'new' }}
        chapters={[chapter]}
        chapterId="ch-1"
        editable
        onOtherFile={() => undefined}
        onCancel={() => undefined}
      />
    </QueryClientProvider>,
  )
  return { screen, requests }
}

describe('ImportPreview', () => {
  test('a file with errors cannot be created: the button says why, and an issue leads to its row', async () => {
    const { screen, requests } = await render(invalid)
    const create = screen.getByRole('button', { name: m.assessment_import_create_exam() })
    await expect.element(create).toHaveAttribute('aria-disabled', 'true')
    await expect.element(create).toHaveAccessibleDescription(m.assessment_import_fix_hint())
    // Row 5 had no type: the server planned no question, the card still shows the row and its issue.
    await screen.getByRole('button', { name: `Тест → B5: ${m.assessment_import_issue_type_invalid()}` }).click()
    await expect.poll(() => document.activeElement?.id).toBe('import-row-5')
    expect(requests).toHaveLength(0)
  })

  test('the questions read as in the file: plain text kept as typed, the correct option and the short answer', async () => {
    const { screen } = await render(ready)
    const counts = [
      m.assessment_import_count_questions({ count: 2 }),
      m.assessment_import_count_single({ count: '1' }),
      m.assessment_import_count_short({ count: '1' }),
    ]
    await expect.element(screen.getByText(counts.join(' · '))).toBeVisible()
    const prompt = screen.getByText('for (int i = 0;', { exact: false })
    await expect.element(prompt).toHaveTextContent('for (int i = 0;\n  i < 3; i++)', { normalizeWhitespace: false })
    await expect.element(screen.getByText(m.assessment_import_correct())).toBeInTheDocument()
    await expect.element(screen.getByText(m.assessment_import_accepted({ answer: '42' }))).toBeVisible()
  })

  test('«Создать тест» commits once with the edited settings under an Idempotency-Key', async () => {
    const committed = { ...ready, status: 'committed', result: { assessment_id: 'as-1', activity_id: 'ac-1' } }
    const { screen, requests } = await render(ready, () => Response.json(committed))
    await screen.getByRole('radio', { name: m.assessment_import_kind_quiz() }).click()
    await screen.getByRole('textbox', { name: m.assessment_import_field_attempts() }).fill('0')
    await screen.getByRole('button', { name: m.assessment_import_create_quiz() }).click()
    await expect.poll(() => requests.length).toBe(1)
    const [request] = requests
    expect(request?.url).toMatch(/\/api\/v2\/assessment-imports\/imp-1\/commit$/u)
    expect(request?.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request?.json()).toEqual({
      target: { mode: 'new', chapter_id: 'ch-1', kind: 'quiz' },
      title: 'Java',
      max_attempts: null,
      time_limit_seconds: 600,
      draw_count: null,
      draw_strata: [],
      partial_credit: false,
      passing_score: 50,
    })
  })
})
