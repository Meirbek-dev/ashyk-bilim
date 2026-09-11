/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RBACAdminClient from '@/app/_shared/dash/admin/roles/client'

const catalog: Record<string, string> = {
  'roles.admin.name': 'Administrator',
  'roles.admin.description': 'Full access',
}
vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) =>
    Object.assign((key: string) => (ns ? key : (catalog[key] ?? key)), { has: (key: string) => key in catalog }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ session: { roles: ['admin'], permissions: ['*:*:*'] }, user: { id: 'admin-id' }, can: () => true }),
}))

const listRoles = vi.fn()
const setRolePermissions = vi.fn()
vi.mock('@/services/rbac', () => ({
  listRoles: () => listRoles(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  setRolePermissions: (...args: unknown[]) => setRolePermissions(...args),
}))

const roles = [
  { slug: 'admin', display_name_key: 'roles.admin.name', description_key: 'roles.admin.description', priority: 100, is_system: true, permissions: ['*:*:*'] },
  { slug: 'ta', display_name_key: 'Teaching assistant', description_key: 'helps out', priority: 20, is_system: false, permissions: ['course:read:all'] },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <RBACAdminClient />
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeEach(() => {
  vi.clearAllMocks()
  listRoles.mockResolvedValue(roles)
  setRolePermissions.mockResolvedValue(undefined)
})

describe('/dash/admin/roles (v2 Role wire)', () => {
  it('system roles are read-only with an explanation; custom roles get edit/permissions/delete', async () => {
    renderPage()
    const adminRow = (await screen.findByText('Administrator')).closest('tr')!
    expect(within(adminRow).getByText('Full access')).toBeInTheDocument()
    expect(within(adminRow).getByText('systemRoleReadOnly')).toBeInTheDocument()
    expect(within(adminRow).queryByRole('button')).toBeNull()

    const taRow = screen.getByText('Teaching assistant').closest('tr')!
    expect(within(taRow).getByText('course:read:all')).toBeInTheDocument()
    expect(within(taRow).getByRole('button', { name: 'editRoleAria' })).toBeInTheDocument()
    expect(within(taRow).getByRole('button', { name: 'permissionsAria' })).toBeInTheDocument()
    expect(within(taRow).getByRole('button', { name: 'deleteRoleAria' })).toBeInTheDocument()
  })

  it('replacing the grant set validates the triple, PUTs the full list and refetches roles', async () => {
    const user = userEvent.setup()
    const { invalidate } = renderPage()
    const taRow = (await screen.findByText('Teaching assistant')).closest('tr')!
    await user.click(within(taRow).getByRole('button', { name: 'permissionsAria' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByRole('combobox')

    await user.type(input, 'not a grant{Enter}')
    expect(within(dialog).getByText('invalidGrant')).toBeInTheDocument()
    expect(setRolePermissions).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, 'quiz:*:own{Enter}')
    // chips keep insertion order: drop the original course:read:all, keep the new grant
    await user.click(within(dialog).getAllByRole('button', { name: 'removeGrantAria' })[0]!)
    await user.click(within(dialog).getByRole('button', { name: 'save' }))

    await waitFor(() => expect(setRolePermissions).toHaveBeenCalledWith('ta', ['quiz:*:own']))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'roles'] }))
  })
})
