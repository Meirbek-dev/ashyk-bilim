/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))

vi.mock('next-intl', () => ({
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
    number: (value: number) => String(value),
  }),
  useLocale: () => 'ru-RU',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = () => false
    return t
  },
}))

vi.mock('@/features/ai-experience', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/ai-experience')>()),
  useAIRunController: () => ({
    cancel: vi.fn(),
    error: null,
    latestArtifact: undefined,
    pending: false,
    start: vi.fn(),
    state: 'idle',
  }),
}))

import { CourseAnalysisEntry } from '@/features/course-analysis/components/course-analysis-entry'

const COURSE_ID = '01a0910d-2963-7483-a97d-40dc56e9aa20'

/** Verbatim `GET /ai/course-analysis/{course}/latest` answer from the Rust server (draft mode). */
const wire = {
  id: '01a09220-613f-7bab-9735-e2ee0d5ded85',
  course_id: COURSE_ID,
  run_id: '01a09220-60a8-736e-994f-0c8d478fd89b',
  triggered_by: '01a0910c-796a-7bf1-8475-cb7d3130f81a',
  status: 'needs_human_review',
  language: 'auto',
  public_score: 72,
  report: {
    citations: [
      {
        citation_id: 'course-draft',
        confidence: 0.4,
        excerpt: 'Черновик анализа создан без доступа к модели.',
        label: 'Контекст курса',
        source_type: 'course',
      },
    ],
    confidence: 'low',
    language: 'auto',
    public_score: 72,
    recommendations: [
      {
        action: 'Настройте флаги функций ИИ и ключи провайдера.',
        priority: 'high',
        rationale: 'Текущий результат является детерминированным черновиком.',
        title: 'Включить анализ с использованием провайдера',
      },
    ],
    risks: ['Ключи провайдера или флаги функций ИИ не включены.'],
    strengths: ['Материалы курса присутствуют.'],
    summary: 'Анализ ИИ еще не включен.',
  },
  evidence: { citations: [] },
  model_name: 'draft-mode',
  content_hash: '11a2fb38',
  stale: false,
  previous_public_score: null,
  created_at_unix: 1_789_157_991,
  published_at_unix: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function answerLatest(handler: (parse: (value: unknown) => unknown) => unknown) {
  mocks.apiJson.mockImplementation((_path: string, _init: unknown, parse: (value: unknown) => unknown) =>
    Promise.resolve().then(() => handler(parse)),
  )
}

describe('CourseAnalysisEntry on the v2 wire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the v2 `report` / `created_at_unix` fields of the latest analysis', async () => {
    answerLatest(parse => parse(wire))

    render(<CourseAnalysisEntry courseUuid={COURSE_ID} />, { wrapper })

    expect(await screen.findByText(wire.report.summary)).toBeInTheDocument()
    expect(screen.getByText(wire.report.risks[0]!)).toBeInTheDocument()
    expect(screen.getByText(wire.report.strengths[0]!)).toBeInTheDocument()
    expect(screen.getByText(wire.report.recommendations[0]!.title)).toBeInTheDocument()
    expect(screen.getByText(wire.report.citations[0]!.label)).toBeInTheDocument()
    expect(screen.getByText('2026-09-11T20:19:51.000Z')).toBeInTheDocument()
    expect(mocks.apiJson).toHaveBeenCalledWith(
      `ai/course-analysis/${COURSE_ID}/latest`,
      undefined,
      expect.any(Function),
    )
  })

  it('rejects a v1 payload instead of rendering an empty panel', async () => {
    answerLatest(parse => parse({ ...wire, id: undefined, analysis_uuid: 'x', report_json: wire.report }))

    render(<CourseAnalysisEntry courseUuid={COURSE_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.errorRecovery.title')).toBeInTheDocument()
    expect(screen.queryByText(wire.report.summary)).not.toBeInTheDocument()
  })

  it.each([
    ['null body', () => null],
    [
      '404 not-found',
      () => {
        throw new APIError({ code: 'not-found', message: 'course analysis not found', status: 404 })
      },
    ],
  ])('renders the localized empty state on a %s', async (_label, answer) => {
    answerLatest(answer)

    render(<CourseAnalysisEntry courseUuid={COURSE_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.courseAnalysisEntry.emptyTitle')).toBeInTheDocument()
    expect(screen.getByText('AiExperience.courseAnalysisEntry.defaultStatus')).toBeInTheDocument()
    expect(screen.queryByText(/not found/u)).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.errorRecovery.title')).not.toBeInTheDocument()
  })

  it('renders a 503 ai-disabled as the localized unavailable state', async () => {
    answerLatest(() => {
      throw new APIError({ code: 'ai-disabled', message: 'AI features are disabled', status: 503 })
    })

    render(<CourseAnalysisEntry courseUuid={COURSE_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.errorRecovery.unavailableTitle')).toBeInTheDocument()
    expect(screen.queryByText('AI features are disabled')).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.errorRecovery.retry')).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.courseAnalysisEntry.emptyTitle')).not.toBeInTheDocument()
  })
})
