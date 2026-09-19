/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UserRolesClient from '@/app/_shared/dash/admin/users/client'
import { APIError } from '@/lib/api/assertSuccess'

// `t` needs `.has` because role labels resolve `roles.<slug>.name` through the root catalog.
const catalog: Record<string, string> = {
  'roles.instructor.name': 'Teacher',
  'roles.user.name': 'User',
  'fields.password-policy': 'Needs a symbol',
}
vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => catalog[key] ?? key, { has: (key: string) => key in catalog }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The assign dialog's user picker walks `GET /users` through `apiJson` (allMembersQueryOptions).
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(() => Promise.resolve(wire)) }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ session: { roles: ['admin'], permissions: ['*:*:*'] }, user: { id: 'admin-id' }, can: () => true }),
}))

const listUsers = vi.fn()
const listRoles = vi.fn()
const assignRoleToUser = vi.fn()
const createUser = vi.fn()
vi.mock('@/services/rbac', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  listRoles: () => listRoles(),
  assignRoleToUser: (...args: unknown[]) => assignRoleToUser(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  removeRoleFromUser: vi.fn(),
  setUserStatus: vi.fn(),
}))

const wire = {
  items: [
    { id: 'admin-id', username: 'admin', email: 'admin@ashyq.local', display_name: 'Aliya Admin', status: 'active', roles: ['admin'], created_at_unix: 1 },
    { id: 'teacher-id', username: 'teacher', email: 'teacher@ashyq.local', display_name: 'Daniyar Teacher', status: 'disabled', roles: ['instructor', 'user'], created_at_unix: 1 },
  ],
  next_cursor: null,
}
const roles = [
  { slug: 'instructor', display_name_key: 'roles.instructor.name', description_key: '', display_name: null, description: null, priority: 50, is_system: true, permissions: [] },
  { slug: 'user', display_name_key: 'roles.user.name', description_key: '', display_name: null, description: null, priority: 10, is_system: true, permissions: [] },
  { slug: 'custom-x', display_name_key: 'roles.custom-x.name', description_key: 'roles.custom-x.description', display_name: 'Custom X', description: null, priority: 5, is_system: false, permissions: [] },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <UserRolesClient />
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeEach(() => {
  vi.clearAllMocks()
  listUsers.mockResolvedValue(wire)
  listRoles.mockResolvedValue(roles)
  assignRoleToUser.mockResolvedValue(undefined)
})

describe('/dash/admin/users (v2 AdminUserPage wire)', () => {
  it('renders one row per user with email, status and localized role chips (custom roles show raw text)', async () => {
    renderPage()
    const teacherRow = (await screen.findByText('teacher@ashyq.local')).closest('tr')!
    expect(listUsers).toHaveBeenCalledWith({ q: '', limit: 50 })
    expect(within(teacherRow).getByText('Teacher')).toBeInTheDocument()
    expect(within(teacherRow).getByText('User')).toBeInTheDocument()
    expect(within(teacherRow).getByText('status.disabled')).toBeInTheDocument()
    // the caller's own row never offers the disable action
    const adminRow = screen.getByText('admin@ashyq.local').closest('tr')!
    expect(within(adminRow).queryByRole('button', { name: 'disableUser' })).toBeNull()
    expect(within(teacherRow).getByRole('button', { name: 'enableUser' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('assigning a role POSTs the slug and invalidates the admin user listing', async () => {
    const user = userEvent.setup()
    const { invalidate } = renderPage()
    await screen.findByText('teacher@ashyq.local')
    await user.click(screen.getByRole('button', { name: 'addRole' }))
    const dialog = await screen.findByRole('dialog')
    const [userBox, roleBox] = within(dialog).getAllByRole('combobox')
    await user.type(userBox!, 'teacher@')
    await user.click(await screen.findByRole('option', { name: /teacher@ashyq\.local/ }))
    await user.click(roleBox!)
    await user.click(await screen.findByRole('option', { name: 'Custom X' }))
    await user.click(within(dialog).getByRole('button', { name: 'assignRole' }))

    await waitFor(() => expect(assignRoleToUser).toHaveBeenCalledWith('teacher-id', 'custom-x'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'admin'] }))
  })

  it('creating a user POSTs the wire body (optional password omitted) and refreshes the listing', async () => {
    createUser.mockResolvedValue({ id: 'new-id', username: 'newbie', display_name: 'New Bie' })
    const user = userEvent.setup()
    const { invalidate } = renderPage()
    await screen.findByText('teacher@ashyq.local')
    await user.click(screen.getByRole('button', { name: 'createUser' }))
    const dialog = await screen.findByRole('dialog')
    const input = (name: string) => dialog.querySelector<HTMLInputElement>(`#create-user-${name}`)!
    await user.type(input('firstName'), 'New')
    await user.type(input('lastName'), 'Bie')
    await user.type(input('username'), 'newbie')
    await user.type(input('email'), 'newbie@ashyq.local')
    await user.click(within(dialog).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Teacher' }))
    await user.click(within(dialog).getByRole('button', { name: 'createUserSubmit' }))

    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith({
        username: 'newbie',
        email: 'newbie@ashyq.local',
        first_name: 'New',
        last_name: 'Bie',
        roles: ['instructor'],
      }),
    )
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'admin'] }))
  })

  it('UX-130: a 422 password-policy lands on the password field, not the banner', async () => {
    createUser.mockRejectedValue(
      new APIError({
        status: 422,
        code: 'validation-failed',
        message: 'validation failed',
        fieldErrors: [{ field: 'password', code: 'password-policy', message: 'must contain symbol' }],
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('teacher@ashyq.local')
    await user.click(screen.getByRole('button', { name: 'createUser' }))
    const dialog = await screen.findByRole('dialog')
    const input = (name: string) => dialog.querySelector<HTMLInputElement>(`#create-user-${name}`)!
    await user.type(input('firstName'), 'New')
    await user.type(input('lastName'), 'Bie')
    await user.type(input('username'), 'newbie')
    await user.type(input('email'), 'newbie@ashyq.local')
    await user.type(input('password'), 'Password1')
    await user.click(within(dialog).getByRole('button', { name: 'createUserSubmit' }))

    await waitFor(() => expect(input('password')).toHaveAttribute('aria-invalid', 'true'))
    // UX-131: the rejection is an alert the input describes, styled as an error.
    const rejection = within(dialog).getByRole('alert')
    expect(rejection).toHaveTextContent('Needs a symbol')
    expect(rejection).toHaveClass('text-destructive')
    expect(rejection).toHaveAttribute('id', 'create-user-password-error')
    expect(input('password')).toHaveAttribute('aria-describedby', 'create-user-password-error')
    expect(within(dialog).queryByText('validation failed')).not.toBeInTheDocument()
  })
})
