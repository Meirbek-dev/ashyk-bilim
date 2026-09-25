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
  updateOverride: vi.fn(),
  deleteOverride: vi.fn(),
  overrides: [] as Record<string, unknown>[],
  cells: [] as { assessment_id: string; user_id: string }[],
  users: [{ id: 'u1', username: 'mira', display_name: 'Mira', avatar_key: null }],
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
        users: mocks.users,
        usergroups: [],
      },
      headers: { etag: '"3"' },
    }
  },
}))
vi.mock('@/lib/api/generated/assessments/assessments', () => ({
  listOverrides: async () => mocks.overrides,
  createOverride: mocks.createOverride,
  updateOverride: mocks.updateOverride,
  deleteOverride: mocks.deleteOverride,
}))
vi.mock('@/lib/api/generated/usergroups/usergroups', () => ({
  usergroupsForCourse: async () => [],
  listUsergroupMembers: async () => [],
}))
vi.mock('@/features/grading/queries/grading.query', () => ({
  collectGradebookPages: async () => [{ users: mocks.users, cells: mocks.cells }],
}))

function renderTab(courseUuid: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <QueryClientProvider client={client}>
        <AccessManagementTab assessmentUuid="a1" courseUuid={courseUuid} disabled={false} />
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
  mocks.updateOverride.mockReset()
  mocks.deleteOverride.mockReset()
  mocks.toastError.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.overrides = []
  mocks.cells = []
  mocks.users = [{ id: 'u1', username: 'mira', display_name: 'Mira', avatar_key: null }]
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

  // UX-207: one learner joined the staff, the other is saved — each is reported.
  it('a bulk override marks the refused learner and badges the saved one', async () => {
    mocks.users = [
      { id: 'u1', username: 'mira', display_name: 'Mira', avatar_key: null },
      { id: 'u2', username: 'aru', display_name: 'Aru', avatar_key: null },
    ]
    mocks.createOverride.mockImplementation(async (_id: string, userId: string) => {
      if (userId === 'u1') throw validation('user_id', 'staff')
      return { user_id: userId, max_attempts_override: 2 }
    })
    renderTab()
    await screen.findAllByText('Aru')
    fireEvent.change(screen.getByLabelText('Лимит попыток'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Применить/ }))
    await screen.findByText('Входит в команду курса.')
    await waitFor(() => expect(screen.getAllByText('Исключение').length).toBeGreaterThan(0))
    const badged = screen.getAllByRole('button').filter(button => within(button).queryByText('Исключение'))
    expect(badged.every(row => within(row).queryByText('Aru'))).toBe(true)
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  // UX-208: the refused staffer's override is gone server-side — the stale row goes too.
  it('drops the cached override of a learner refused as staff', async () => {
    mocks.overrides = [{ user_id: 'u1' }]
    mocks.updateOverride.mockRejectedValue(validation('user_id', 'staff'))
    renderTab()
    await waitFor(() => expect(screen.getAllByText('Исключение').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: /Применить/ }))
    await screen.findByText('Входит в команду курса.')
    await waitFor(() => expect(screen.queryByText('Исключение')).toBeNull())
  })

  // UX-213: taking a learner with attempts off the list asks first, counting them.
  it('asks before a save drops learners who already have attempts', async () => {
    mocks.users = [
      { id: 'u1', username: 'mira', display_name: 'Mira', avatar_key: null },
      { id: 'u2', username: 'aru', display_name: 'Aru', avatar_key: null },
    ]
    mocks.cells = [
      { assessment_id: 'a1', user_id: 'u1' },
      { assessment_id: 'other', user_id: 'u2' },
    ]
    mocks.setAccess.mockResolvedValue({ mode: 'restricted', effective_user_count: 1, users: [], usergroups: [] })
    renderTab('c1')
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить из выбранной аудитории' })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('1 учащийся, у которого уже есть попытки')
    expect(mocks.setAccess).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить всё равно' }))
    await waitFor(() =>
      expect(mocks.setAccess).toHaveBeenCalledWith(
        'assessments/a1/access',
        { mode: 'restricted', user_ids: ['u2'], usergroup_ids: [] },
        '"3"',
      ),
    )
  })

  it('saves without asking when nobody with attempts is dropped', async () => {
    mocks.users = [
      { id: 'u1', username: 'mira', display_name: 'Mira', avatar_key: null },
      { id: 'u2', username: 'aru', display_name: 'Aru', avatar_key: null },
    ]
    mocks.cells = [{ assessment_id: 'a1', user_id: 'u2' }]
    mocks.setAccess.mockResolvedValue({ mode: 'restricted', effective_user_count: 1, users: [], usergroups: [] })
    renderTab('c1')
    await screen.findAllByText('Mira')
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить из выбранной аудитории' })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить доступ' }))
    await waitFor(() => expect(mocks.setAccess).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  // BUG-317: only the attempts were edited — the waiver, extension, note and expiry stay.
  it('a bulk override keeps the fields the teacher did not change', async () => {
    mocks.overrides = [
      {
        user_id: 'u1',
        max_attempts_override: null,
        due_at_override_unix: 1_900_000_000,
        waive_late_penalty: true,
        note: 'extension',
        expires_at_unix: 1_950_000_000,
      },
    ]
    mocks.updateOverride.mockResolvedValue({ ...mocks.overrides[0], max_attempts_override: 5 })
    renderTab()
    await waitFor(() => expect(screen.getAllByText(/Исключение|попыт/).length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('Лимит попыток'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Применить/ }))
    await waitFor(() =>
      expect(mocks.updateOverride).toHaveBeenCalledWith('a1', 'u1', {
        max_attempts_override: 5,
        due_at_override_unix: 1_900_000_000,
        waive_late_penalty: true,
        note: 'extension',
        expires_at_unix: 1_950_000_000,
      }),
    )
  })

  // UX-208: clearing an override that is already gone (404) is a success, not an error.
  it('treats a 404 on clearing an override as already cleared', async () => {
    mocks.overrides = [{ user_id: 'u1' }]
    mocks.deleteOverride.mockRejectedValue(
      new APIError({ status: 404, code: 'not-found', message: 'override not found' }),
    )
    renderTab()
    await waitFor(() => expect(screen.getAllByText('Исключение').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Очистить' }))
    await waitFor(() => expect(screen.queryByText('Исключение')).toBeNull())
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalled()
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
