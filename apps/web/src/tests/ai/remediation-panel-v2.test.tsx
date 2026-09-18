/** @vitest-environment jsdom */

import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  /** Per `persistenceKey` prefix: what `useAIRunController` answers for that surface. */
  controllers: {} as Record<string, Record<string, unknown>>,
}))

vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))

vi.mock('next-intl', () => ({
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString(), number: (value: number) => String(value) }),
  useLocale: () => 'ru-RU',
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.has = () => false
    return t
  },
}))

vi.mock('@/features/ai-experience', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/ai-experience')>()),
  useAIRunController: ({ persistenceKey }: { persistenceKey: string }) => ({
    cancel: vi.fn(),
    error: null,
    latestArtifact: undefined,
    pending: false,
    start: vi.fn(),
    state: 'idle',
    ...mocks.controllers[persistenceKey.split(':')[0]!],
  }),
}))

import { useRemediationSession } from '@/features/remediation/api/use-remediation'
import { SubmissionAIEntry } from '@/features/submission-analysis/components/submission-ai-entry'

const SUBMISSION_ID = '01a091c9-0199-7e95-9346-d1ae4fc9823e'
const SESSION_ID = '01a09221-0965-74e3-b175-041d6f27992e'

/** `lecture` of a `RemediationSession` / `content` of the remediation run's final artifact (draft mode). */
const lecture = {
  citations: [
    {
      citation_id: 'remediation-draft',
      confidence: 0.4,
      excerpt: 'Черновик восполнения пробелов создан без доступа к модели.',
      label: 'Анализ решения',
      source_type: 'submission_analysis',
    },
  ],
  language: 'auto',
  learning_objectives: ['Подтвердить основное заблуждение'],
  micro_lecture_markdown: 'Восполнение пробелов с использованием ИИ еще не включено.',
  pass_threshold: 70,
  practice_questions: [{ answer: 'a', choices: [], explanation: 'e', prompt: 'p' }],
  title: 'Черновик восполнения пробелов для проверки преподавателем',
}

/** Verbatim `GET /ai/remediation/sessions/{id}` answer from the Rust server. */
const sessionWire = {
  id: SESSION_ID,
  submission_id: SUBMISSION_ID,
  activity_id: '01a091a1-0461-7a3c-9433-3920a37d67e7',
  student_user_id: '01a0910c-796a-75f5-b21c-93955233d327',
  analysis_id: '01a09221-0892-7eb4-b204-7047c305b883',
  run_id: '01a09221-090b-7c6f-b672-73e94134b3cc',
  status: 'assigned',
  gate_mode: true,
  language: 'auto',
  lecture,
  test: { questions: lecture.practice_questions },
  score: null,
  passed_at_unix: null,
  created_at_unix: 1_789_158_034,
  updated_at_unix: 1_789_158_034,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function answerApi(handler: (path: string, parse: (value: unknown) => unknown) => unknown) {
  mocks.apiJson.mockImplementation((path: string, _init: unknown, parse: (value: unknown) => unknown) =>
    Promise.resolve().then(() => handler(path, parse)),
  )
}

describe('remediation on the v2 wire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.controllers = {}
    // The submission-analysis panel hosts the remediation surface; keep it on "no analysis yet".
    answerApi((_path, parse) => parse(null))
  })

  it('parses a stored session with its `lecture` / `test` blobs', async () => {
    answerApi((_path, parse) => parse(sessionWire))

    const { result } = renderHook(() => useRemediationSession(SESSION_ID), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.id).toBe(SESSION_ID)
    expect(result.current.data?.lecture.title).toBe(lecture.title)
    expect(result.current.data?.lecture.micro_lecture_markdown).toBe(lecture.micro_lecture_markdown)
    expect(mocks.apiJson).toHaveBeenCalledWith(`ai/remediation/sessions/${SESSION_ID}`, undefined, expect.any(Function))
  })

  it('surfaces a 404 on an unknown session instead of an empty session', async () => {
    answerApi(() => {
      throw new APIError({ code: 'not-found', message: 'remediation session not found', status: 404 })
    })

    const { result } = renderHook(() => useRemediationSession(SESSION_ID), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toMatchObject({ code: 'not-found' })
  })

  it('renders the lecture from the queued run’s final `RunArtifact.content`', async () => {
    mocks.controllers['submission-remediation'] = {
      latestArtifact: {
        content: lecture,
        created_at_unix: 1_789_158_034,
        final: true,
        id: '01a09221-09bd-7e91-80d0-4acafae8fd28',
        kind: 'remediation',
      },
      state: 'complete',
    }

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} />, { wrapper })

    expect(await screen.findByText(lecture.title)).toBeInTheDocument()
    expect(screen.getByText(lecture.micro_lecture_markdown)).toBeInTheDocument()
    expect(screen.getByText(lecture.citations[0]!.label)).toBeInTheDocument()
    expect(screen.getByText('AiExperience.remediation.activeGate')).toBeInTheDocument()
  })

  it('reads the stored session on the work, so a passed gate says so to the grader (UX-115)', async () => {
    answerApi((path, parse) =>
      path === `ai/remediation/${SUBMISSION_ID}/latest`
        ? parse({ ...sessionWire, status: 'passed', score: 80 })
        : parse(null),
    )
    // The run artifact from an earlier visit says "assigned"; the store wins.
    mocks.controllers['submission-remediation'] = {
      latestArtifact: { content: lecture, created_at_unix: 1, final: true, id: 'a', kind: 'remediation' },
      state: 'complete',
    }

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.remediation.gatePassed')).toBeInTheDocument()
    expect(screen.queryByText('AiExperience.remediation.activeGate')).not.toBeInTheDocument()
    expect(mocks.apiJson).toHaveBeenCalledWith(
      `ai/remediation/${SUBMISSION_ID}/latest`,
      undefined,
      expect.any(Function),
    )
  })

  it('renders nothing for a run that has no lecture artifact yet', async () => {
    mocks.controllers['submission-remediation'] = {
      latestArtifact: { content: { citations: [] }, created_at_unix: 1, final: false, id: 'x', kind: 'draft' },
      state: 'running',
    }

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.submissionAIEntry.emptyTitle')).toBeInTheDocument()
    expect(screen.queryByText('AiExperience.remediation.activeGate')).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.errorRecovery.title')).not.toBeInTheDocument()
  })

  it('renders a 503 ai-disabled on the remediation queue as the localized unavailable state', async () => {
    mocks.controllers['submission-remediation'] = {
      error: new APIError({ code: 'ai-disabled', message: 'AI features are disabled', status: 503 }),
      state: 'failed',
    }

    render(<SubmissionAIEntry submissionUuid={SUBMISSION_ID} />, { wrapper })

    expect(await screen.findByText('AiExperience.errorRecovery.unavailableTitle')).toBeInTheDocument()
    expect(screen.queryByText('AI features are disabled')).not.toBeInTheDocument()
    expect(screen.queryByText('AiExperience.errorRecovery.retry')).not.toBeInTheDocument()
  })
})
