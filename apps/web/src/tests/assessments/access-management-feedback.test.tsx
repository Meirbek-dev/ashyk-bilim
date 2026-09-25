/** @vitest-environment jsdom */
// UX-057: restricted access with an empty list asks before locking everyone
// out; 422 field errors land on the chip / input they name, not in a toast.
// UX-154: the save echoes the loaded ETag as If-Match; a 412 reloads the
// policy instead of silently overwriting the other tab.
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
  overrides: [] as { user_id: string }[],
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('@/lib/api-client', () => ({
  apiJson: vi.fn(),
  apiResult: async (path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (init?.method === 'PUT') {
      const data = await mocks.setAccess(path, JSON.parse(init.body ?? '{}'), init.headers?.['If-Match'])
      return { data, headers: { etag: '"4"' } }
    }
    return {
      data: {
        mode: 'restricted',
        effective_user_count: 1,
        users: [{ id: 'u1', username: 'mira', display_name: 'Mira', avatar_key: null }],
        usergroups: [],
      },
      headers: { etag: '"3"' },
    }
  },
}))
vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  listOverrides: async () => mocks.overrides,
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
  mocks.overrides = []
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
      expect(mocks.setAccess).toHaveBeenCalledWith(
        'assessments/a1/access',
        { mode: 'restricted', user_ids: [], usergroup_ids: [] },
        '"3"',
      ),
    )
  })

  it('a stale save (412) reloads the policy and says why instead of overwriting (UX-154)', async () => {
    mocks.setAccess.mockRejectedValue(
      new APIError({ status: 412, code: 'precondition-failed', message: 'access changed since you loaded it' }),
    )
    renderTab()
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    await screen.findByText(/изменена другим пользователем/)
    expect(mocks.setAccess).toHaveBeenCalledTimes(1)
  })

  it('renders a not-in-course 422 on the learner chip, not as a toast', async () => {
    mocks.setAccess.mockRejectedValue(validation('user_ids.u1', 'not-in-course'))
    renderTab()
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    await screen.findByText('Не записан на этот курс.')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  // UX-206: a learner who joined the staff since the tab loaded is named as staff.
  it('renders a staff 422 on the chip as course staff', async () => {
    mocks.setAccess.mockRejectedValue(validation('user_ids.u1', 'staff'))
    renderTab()
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    await screen.findByText('Входит в команду курса.')
    expect(screen.queryByText('Не записан на этот курс.')).toBeNull()
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

  it('puts the override badge under the learner name, not beside it (UX-195)', async () => {
    mocks.overrides = [{ user_id: 'u1' }]
    renderTab()
    await waitFor(() => expect(screen.getAllByText('Исключение').length).toBeGreaterThan(0))
    const row = screen.getAllByRole('button').find(button => within(button).queryByText('Исключение'))
    const name = within(row as HTMLElement).getByText('Mira')
    expect(name.parentElement).toContainElement(within(row as HTMLElement).getByText('Исключение'))
    expect(name).not.toHaveClass('truncate')
  })
})
