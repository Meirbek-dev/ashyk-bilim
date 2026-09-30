/** @vitest-environment jsdom */
// Gauntlet F37: publishing the quality score gave no feedback, and the
// confidence / priority enums rendered raw (`low`, `high`).
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'sonner'

const mocks = vi.hoisted(() => ({ apiJson: vi.fn(), publish: vi.fn() }))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@/lib/api/generated/ai/ai', () => ({
  publishCourseAnalysis: mocks.publish,
  queueCourseAnalysis: vi.fn(),
  reviewCourseFinding: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useApiError', () => ({ useApiError: () => ({ toastApiError: vi.fn() }) }))
vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString(), number: (value: number) => String(value) }),
  useLocale: () => 'ru-RU',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = (key: string) => key.startsWith('priorities.') || key.startsWith('severities.')
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
const wire = {
  id: '01a09220-613f-7bab-9735-e2ee0d5ded85',
  course_id: COURSE_ID,
  run_id: '01a09220-60a8-736e-994f-0c8d478fd89b',
  triggered_by: '01a0910c-796a-7bf1-8475-cb7d3130f81a',
  status: 'needs_human_review',
  language: 'auto',
  public_score: 72,
  report: {
    citations: [{ citation_id: 'c', confidence: 0.4, excerpt: 'x', label: 'Контекст курса', source_type: 'course' }],
    confidence: 'low',
    language: 'auto',
    public_score: 72,
    recommendations: [{ action: 'a', priority: 'high', rationale: 'r', title: 'Включить анализ' }],
    risks: [],
    strengths: [],
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('CourseAnalysisEntry publish + enum labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiJson.mockImplementation((_path: string, _init: unknown, parse: (value: unknown) => unknown) =>
      Promise.resolve().then(() => parse(wire)),
    )
    mocks.publish.mockResolvedValue({ ...wire, status: 'published' })
  })

  it('localizes confidence and finding priority instead of printing the enum', async () => {
    render(<CourseAnalysisEntry courseUuid={COURSE_ID} />, { wrapper })
    await screen.findByText(wire.report.summary)
    expect(screen.getByText('AIConfidenceMeter.low')).toBeInTheDocument()
    expect(screen.getByText('AiExperience.courseAnalysisResultShell.priorities.high')).toBeInTheDocument()
    expect(screen.queryByText('low')).not.toBeInTheDocument()
    expect(screen.queryByText('high')).not.toBeInTheDocument()
  })

  it('toasts once the score is published', async () => {
    render(<CourseAnalysisEntry courseUuid={COURSE_ID} />, { wrapper })
    await screen.findByText(wire.report.summary)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'AiExperience.courseAnalysisResultShell.publishScore' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'AiExperience.courseAnalysisResultShell.confirmPublish' }),
    )
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(wire.id))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('AiExperience.courseAnalysisEntry.publishedToast'))
  })
})
