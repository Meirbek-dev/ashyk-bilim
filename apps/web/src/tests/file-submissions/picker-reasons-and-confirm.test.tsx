/** @vitest-environment jsdom */
// UX-036: a refused file stays in the list with its own reason (size / type)
// instead of one generic toast, and submitting on a capped activity asks for
// confirmation before it spends the attempt.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), submit: vi.fn(), refresh: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useFormatter: () => ({ number: (n: number) => String(n) }),
}))
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
  allowed_mime_types: ['application/pdf'],
  max_files: 3,
  max_file_size_mb: 1,
  max_attempts: 2,
  due_at_unix: null,
  current_attempt: draft,
  attempts: [draft],
}

beforeEach(() => {
  mocks.getActivity.mockReset().mockResolvedValue(config)
  mocks.submit.mockReset().mockResolvedValue({ ...draft, status: 'submitted' })
})

function renderWorkspace() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FileSubmissionWorkspace
        activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
        course={{ course_uuid: 'course_c1' } as CourseStructure}
      />
    </QueryClientProvider>,
  )
}

describe('FileSubmissionWorkspace picker + submit confirm (UX-036)', () => {
  it('lists each refused file with its reason', async () => {
    renderWorkspace()
    const input = (await screen.findByText('dropzoneTitle')).parentElement!.querySelector('input[type="file"]')!
    const png = new File(['x'], 'shot.png', { type: 'image/png' })
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [png, big] } })
    expect(await screen.findByText('fileTypeNotAllowed')).toBeInTheDocument()
    expect(screen.getByText('fileTooLarge')).toBeInTheDocument()
  })

  it('asks before spending a capped attempt, then submits', async () => {
    renderWorkspace()
    fireEvent.click(await screen.findByRole('button', { name: 'submitFiles' }))
    expect(await screen.findByText('confirmSubmitTitle')).toBeInTheDocument()
    expect(mocks.submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'confirmSubmitAction' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith('fs-1', expect.any(Array), 1))
  })
})
