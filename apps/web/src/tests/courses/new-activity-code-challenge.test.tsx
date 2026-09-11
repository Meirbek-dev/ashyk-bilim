/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

// Quick-creating a code challenge from the curriculum "Add Activity" dialog
// sent the legacy body (`kind: 'CODE_CHALLENGE'`, `course_id`, `policy.settings_json`)
// to `POST assessments`, which v2 rejects with 422 — the teacher saw a raw
// validation error and no activity. The v2 body is
// `{chapter_id, kind, title, description, grading_type}`.

const mocks = vi.hoisted(() => ({ apiJson: vi.fn() }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { loading: vi.fn(() => 'toast'), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiJson: mocks.apiJson }))
vi.mock('@components/Contexts/CourseContext', () => ({
  useCourse: () => ({ courseStructure: { id: 'course-1', course_uuid: 'course-1' }, withUnpublishedActivities: true }),
}))
vi.mock('@/hooks/mutations/useActivityMutations', () => ({
  useActivityMutations: () => ({ createActivity: vi.fn(), createFileActivity: vi.fn(), createExternalVideo: vi.fn() }),
}))
vi.mock('@components/Objects/Modals/Activities/Create/NewActivity', () => ({
  default: ({ createAndOpenActivity }: { createAndOpenActivity: (kind: 'codechallenge') => Promise<void> }) => (
    <button type="button" onClick={() => void createAndOpenActivity('codechallenge')}>
      quick-create code challenge
    </button>
  ),
}))

import NewActivityButton from '@/components/Dashboard/Pages/Course/EditCourseStructure/Buttons/NewActivityButton'

describe('NewActivityButton code challenge quick create', () => {
  it('POSTs the v2 CreateAssessmentRequest and refreshes the course structure', async () => {
    mocks.apiJson.mockResolvedValue({ id: 'asm-1', activity_id: 'act-1' })
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    render(
      <QueryClientProvider client={queryClient}>
        <NewActivityButton chapterId="chapter-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'title' }))
    fireEvent.click(await screen.findByRole('button', { name: 'quick-create code challenge' }))

    await waitFor(() => expect(mocks.apiJson).toHaveBeenCalledTimes(1))
    const [path, init] = mocks.apiJson.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('assessments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      kind: 'code_challenge',
      chapter_id: 'chapter-1',
      title: 'quickCreate.codeChallengeName',
      description: null,
      grading_type: 'percentage',
    })
    await waitFor(() => expect(invalidate).toHaveBeenCalled())
  })
})
