/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'
import CourseAuthors from '@components/Objects/Courses/CourseAuthors/CourseAuthors'

const mocks = vi.hoisted(() => ({
  createCourseUpdate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@services/courses/updates', () => ({
  createCourseUpdate: mocks.createCourseUpdate,
  deleteCourseUpdate: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
  useLocale: () => 'ru-RU',
}))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ can: () => true, isAuthenticated: true }) }))
vi.mock('@/features/courses/hooks/useCourseQueries', () => ({ useCourseUpdates: () => ({ data: [] }) }))
vi.mock('@/features/courses/hooks/useContributors', () => ({ useContributors: () => ({ data: [] }) }))

function renderForm() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CourseAuthors courseUuid="course-1" />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'newUpdate' }))
  fireEvent.change(screen.getByPlaceholderText('updateTitlePlaceholder'), { target: { value: 'Title' } })
  fireEvent.change(screen.getByPlaceholderText('updateContentPlaceholder'), { target: { value: 'Body' } })
  fireEvent.click(screen.getByRole('button', { name: 'publishUpdate' }))
}

// UX-242: the course update form ran through a server action and checked
// `status === 200`, so a 201 read as a failure and a 422 lost its field code.
describe('course update form (UX-242)', () => {
  it('treats the 201 answer as success', async () => {
    mocks.createCourseUpdate.mockResolvedValue({ data: {}, status: 201, headers: {} })
    renderForm()
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('updateAddedSuccess'))
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('shows a server field error inline', async () => {
    mocks.createCourseUpdate.mockRejectedValue(
      new APIError({
        code: 'validation-failed',
        message: 'invalid',
        status: 422,
        fieldErrors: [{ field: 'title', code: 'too-long', message: 'title is too long' }],
      }),
    )
    renderForm()
    expect(await screen.findByText('title is too long')).toBeTruthy()
  })
})
