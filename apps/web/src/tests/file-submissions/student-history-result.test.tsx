/** @vitest-environment jsdom */
// UX-129: with a new draft open, the published attempt 1 lives only in the
// history — its row opens the result (score + teacher feedback).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), apiJson: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useFormatter: () => ({ number: (n: number) => String(n) }),
  useLocale: () => 'ru',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: () => false, user: { id: 'u1' } }) }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/content-markdown', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>,
}))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn(), handleApiError: () => ({ message: '', showRetry: false }) }),
}))
vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()),
  getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
}))

const ACTIVITY_ID = '01a091a1-0461-7a3c-9433-3920a37d67e7'
const published = {
  id: 'att-1',
  status: 'published',
  version: 3,
  attempt_number: 1,
  is_late: false,
  late_penalty_pct: 0,
  final_score: 82,
  feedback: 'Отличный проект',
  submitted_at_unix: 1_788_000_000,
  files: [],
}
const draft = { id: 'att-2', status: 'draft', version: 1, attempt_number: 2, is_late: false, files: [] }
const config = {
  id: 'fs-1',
  instructions: '',
  lifecycle: 'published',
  allowed_mime_types: [],
  max_files: 1,
  max_file_size_mb: 25,
  due_at_unix: 1_789_000_000,
  current_attempt: draft,
  attempts: [draft, published],
  disabled_reasons: [],
}

beforeEach(() => {
  mocks.getActivity.mockReset().mockResolvedValue(config)
  mocks.apiJson.mockReset().mockResolvedValue([])
})

describe('FileSubmissionWorkspace history', () => {
  it('UX-129: a published attempt behind an open draft opens its result from the history row', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <FileSubmissionWorkspace
          activity={{ activity_uuid: `activity_${ACTIVITY_ID}`, activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
          course={{ course_uuid: 'course_c1' } as CourseStructure}
        />
      </QueryClientProvider>,
    )
    await screen.findByRole('button', { name: 'submitFiles' })
    expect(screen.queryByText('Отличный проект')).toBeNull()
    // Only the released attempt's row is a summary; the draft's stays inert.
    const summaries = screen.getAllByText('attemptNumber').map(node => node.closest('summary'))
    expect(summaries.filter(Boolean)).toHaveLength(1)
    fireEvent.click(summaries.find(Boolean)!)
    expect(await screen.findByText('Отличный проект')).toBeTruthy()
    expect(screen.getByText('teacherFeedback')).toBeTruthy()
  })
})
