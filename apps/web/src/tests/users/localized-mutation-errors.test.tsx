/** @vitest-environment jsdom */
// UX-247: a failed role replacement and a rejected chapter rename speak the
// page language through the error-code catalog - never the raw
// `Error.message` («Network request failed») or the server's English title
// («Validation failed»).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  remove: vi.fn(),
  updateChapter: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: mocks.toastError, dismiss: vi.fn() },
}))
vi.mock('@/services/rbac', () => ({ assignRoleToUser: mocks.assign, removeRoleFromUser: mocks.remove }))
vi.mock('@/features/users/hooks/useUsers', () => ({
  useRoles: () => ({
    data: [
      { slug: 'user', priority: 10, is_system: true, permissions: [], display_name_key: '', description_key: '' },
      { slug: 'instructor', priority: 20, is_system: true, permissions: [], display_name_key: '', description_key: '' },
    ],
    error: undefined,
  }),
}))
vi.mock('@/features/users/hooks/useRoleLabels', () => ({
  useRoleLabels: () => ({ roleName: (role: { slug: string }) => role.slug }),
}))
vi.mock('@/hooks/mutations/useChapterMutations', () => ({
  useChapterMutations: () => ({ updateChapter: mocks.updateChapter, deleteChapter: vi.fn() }),
}))
vi.mock('@/components/Dashboard/Pages/Course/EditCourseStructure/Buttons/NewActivityButton', () => ({
  default: () => null,
}))

function wrap(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

it('shows a role replacement network failure in the page language', async () => {
  const { default: RolesUpdate } = await import('@/components/Objects/Modals/Dash/Users/RolesUpdate')
  mocks.remove.mockResolvedValue(undefined)
  mocks.assign.mockRejectedValue(
    new APIError({ code: 'NETWORK_UNAVAILABLE', message: 'Network request failed', status: 0 }),
  )
  wrap(<RolesUpdate user={{ id: 'u1', username: 'alice' }} setRolesModal={vi.fn()} alreadyAssignedRole="user" />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'instructor' } })
  fireEvent.click(screen.getByRole('button', { name: ruMessages.Components.RolesUpdate.updateButton }))

  expect(await screen.findByText(ruMessages.Errors.networkUnavailable)).toBeTruthy()
  expect(screen.queryByText(/Network request failed/)).toBeNull()
})

it('toasts a rejected chapter rename from the error-code catalog', async () => {
  const { default: ChapterElement } =
    await import('@/components/Dashboard/Pages/Course/EditCourseStructure/DraggableElements/ChapterElement')
  mocks.toastError.mockClear()
  mocks.updateChapter.mockRejectedValue(
    new APIError({
      code: 'validation-failed',
      message: 'Validation failed',
      status: 422,
      fieldErrors: [{ field: 'name', code: 'too-long', message: 'name is too long' }],
    }),
  )
  wrap(
    <ChapterElement
      chapter={{ chapter_uuid: 'ch1', name: 'Intro', activities: [] }}
      chapterIndex={0}
      course_uuid="c1"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: ruMessages.CourseEdit.edit }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Renamed' } })
  fireEvent.click(screen.getByRole('button', { name: ruMessages.CourseEdit.save }))

  await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
  expect(mocks.toastError.mock.calls[0]?.[0]).toBe(ruMessages.Errors.codes['validation-failed'])
})
