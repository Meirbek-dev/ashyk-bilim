/** @vitest-environment jsdom */
// Critic 9 F15: after «Отправить файлы» the header badge stayed «Не начато»
// and the footer «Начать» until a reload — the file submit must refresh the
// learner-state projection the way the quiz submit does.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), submit: vi.fn(), refresh: vi.fn() }))

vi.mock('next-intl', () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => false }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: () => false }) }))
vi.mock('@/features/content-markdown', () => ({ MarkdownContent: () => null }))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn(), handleApiError: () => ({ message: '', showRetry: false }) }),
}))
vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()),
  getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
  submitFileSubmission: (...args: unknown[]) => mocks.submit(...args),
}))

const draft = {
  id: 'att-1',
  status: 'draft',
  version: 1,
  attempt_number: 1,
  is_late: false,
  files: [{ id: 'f1', upload_id: 'u1', filename: 'tiny.pdf', size_bytes: 69, mime_type: 'application/pdf' }],
}
const config = {
  id: 'fs-1',
  instructions: '',
  lifecycle: 'published',
  allowed_mime_types: [],
  max_files: 1,
  max_file_size_mb: 25,
  due_at_unix: null,
  current_attempt: draft,
  attempts: [draft],
}

beforeEach(() => {
  mocks.getActivity.mockReset().mockResolvedValue(config)
  mocks.submit.mockReset().mockResolvedValue({ ...draft, status: 'submitted' })
  mocks.refresh.mockReset()
})

describe('FileSubmissionWorkspace submit', () => {
  it('invalidates the learner-course projection and refreshes the runtime after a submit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <FileSubmissionWorkspace
          activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
          course={{ course_uuid: 'course_c1' } as CourseStructure}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'submitFiles' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith('fs-1', expect.any(Array), 1))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['learner-course'] }))
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
