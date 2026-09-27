/** @vitest-environment jsdom */
// BUG-335: save/submit sent the attempt version captured before the upload
// loop; a refetch landing during the upload made the final write a 412.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import FileSubmissionWorkspace from '@/features/file-submissions/student/FileSubmissionWorkspace'
import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'
import { APIError } from '@/lib/api/assertSuccess'

const mocks = vi.hoisted(() => ({ getActivity: vi.fn(), save: vi.fn(), upload: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useFormatter: () => ({ number: (n: number) => String(n) }),
  useLocale: () => 'ru',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@components/ui/AppLink', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: () => false }) }))
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn().mockResolvedValue([]) }))
vi.mock('@/features/content-markdown', () => ({ MarkdownContent: () => null }))
vi.mock('@/hooks/useApiError', () => ({
  useApiError: () => ({ toastApiError: vi.fn(), handleApiError: () => ({ message: '', showRetry: false }) }),
}))
vi.mock('@/features/file-submissions/services/file-submissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/file-submissions/services/file-submissions')>()),
  getFileSubmissionByActivity: (...args: unknown[]) => mocks.getActivity(...args),
  saveFileSubmissionDraft: (...args: unknown[]) => mocks.save(...args),
  uploadSubmissionFile: (...args: unknown[]) => mocks.upload(...args),
}))

const file = (upload_id: string) => ({
  id: upload_id,
  upload_id,
  filename: `${upload_id}.pdf`,
  size_bytes: 1,
  mime_type: 'application/pdf',
})
const attempt = (version: number, files = [file('u1')]) => ({
  id: 'att-1',
  status: 'draft',
  version,
  attempt_number: 1,
  is_late: false,
  files,
})
const config = (current: ReturnType<typeof attempt>) => ({
  id: 'fs-1',
  instructions: '',
  lifecycle: 'published',
  allowed_mime_types: [],
  max_files: 5,
  max_file_size_mb: 25,
  due_at_unix: null,
  current_attempt: current,
  attempts: [current],
})
const key = ['file-submission', 'activity', 'a1']

async function saveWithOnePendingFile(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <FileSubmissionWorkspace
        activity={{ activity_uuid: 'activity_a1', activity_type: 'TYPE_FILE_SUBMISSION' } as Activity}
        course={{ course_uuid: 'course_c1' } as CourseStructure}
      />
    </QueryClientProvider>,
  )
  const input = (await screen.findByText('dropzoneTitle')).parentElement!.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [new File(['x'], 'new.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(await screen.findByRole('button', { name: 'saveDraft' }))
}

beforeEach(() => {
  mocks.getActivity.mockReset().mockResolvedValue(config(attempt(1)))
  mocks.save.mockReset().mockResolvedValue(attempt(9))
  mocks.upload.mockReset().mockResolvedValue({ id: 'u-new', key: 'k' })
})

describe('FileSubmissionWorkspace send-time version (BUG-335)', () => {
  it('sends the version the cache holds after the upload, not the one before it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mocks.upload.mockImplementation(async () => {
      // Another tab attached a file meanwhile; a refetch brought version 2.
      client.setQueryData(key, config(attempt(2, [file('u1'), file('u2')])))
      return { id: 'u-new', key: 'k' }
    })
    await saveWithOnePendingFile(client)
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    const [, files, version] = mocks.save.mock.calls[0]!
    expect(version).toBe(2)
    expect(files.map((f: { upload_id: string }) => f.upload_id)).toEqual(['u1', 'u2', 'u-new'])
  })

  it('refetches and retries once on a 412', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mocks.save.mockImplementationOnce(async () => {
      mocks.getActivity.mockResolvedValue(config(attempt(3)))
      throw new APIError({ code: 'precondition-failed', status: 412, message: 'stale' })
    })
    await saveWithOnePendingFile(client)
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
    expect(mocks.save.mock.calls[1]![2]).toBe(3)
  })
})
