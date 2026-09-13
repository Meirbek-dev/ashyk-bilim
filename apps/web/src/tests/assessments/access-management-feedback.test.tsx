/** @vitest-environment jsdom */
// UX-057: restricted access with an empty list asks before locking everyone
// out; 422 field errors land on the chip / input they name, not in a toast.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import AccessManagementTab from '@/features/assessments/studio/tabs/AccessManagementTab'
import { APIError } from '@/lib/api/assertSuccess'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({
  setAccess: vi.fn(),
  createOverride: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  getAccess: async () => ({
    mode: 'restricted',
    effective_user_count: 1,
    users: [{ id: 'u1', username: 'mira', display_name: 'Mira' }],
    usergroups: [],
  }),
  listOverrides: async () => [],
  setAccess: mocks.setAccess,
  createOverride: mocks.createOverride,
  updateOverride: vi.fn(),
  deleteOverride: vi.fn(),
}))
vi.mock('@/lib/api/generated/usergroups/usergroups', () => ({ usergroupsForCourse: vi.fn() }))
vi.mock('@/features/grading/queries/grading.query', () => ({ collectGradebookPages: vi.fn() }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <QueryClientProvider client={client}>
        <AccessManagementTab assessmentUuid="a1" courseUuid={null} disabled={false} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  )
}

const validation = (field: string, code: string) =>
  new APIError({
    status: 422,
    code: 'validation-failed',
    message: 'validation failed',
    fieldErrors: [{ field, code, message: 'server text' }],
  })

beforeEach(() => {
  mocks.setAccess.mockReset()
  mocks.createOverride.mockReset()
  mocks.toastError.mockReset()
})

describe('access management feedback (UX-057)', () => {
  it('asks before saving a restricted list that would lock everyone out', async () => {
    renderTab()
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить из выбранной аудитории' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    expect(mocks.setAccess).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Никто не сможет пройти')
    mocks.setAccess.mockResolvedValue({ mode: 'restricted', effective_user_count: 0, users: [], usergroups: [] })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить всё равно' }))
    await waitFor(() =>
      expect(mocks.setAccess).toHaveBeenCalledWith('a1', { mode: 'restricted', user_ids: [], usergroup_ids: [] }),
    )
  })

  it('renders a not-in-course 422 on the learner chip, not as a toast', async () => {
    mocks.setAccess.mockRejectedValue(validation('user_ids.u1', 'not-in-course'))
    renderTab()
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    await screen.findByText('Нет доступа к этому курсу.')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('renders an out-of-range override 422 under the attempts input', async () => {
    mocks.createOverride.mockRejectedValue(validation('max_attempts_override', 'out-of-range'))
    renderTab()
    await screen.findAllByText('Mira')
    const attempts = screen.getByLabelText('Лимит попыток')
    expect(attempts).toHaveAttribute('max', '10')
    fireEvent.change(attempts, { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: /Применить/ }))
    await screen.findByText('Значение вне допустимого диапазона.')
    expect(attempts).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
