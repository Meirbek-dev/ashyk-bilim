/** @vitest-environment jsdom */

// Regression tests for the caller-side fixes made after the users/usergroups
// service layer moved to the v2 contract (string ids, slug-based roles,
// "resolved without throwing" success instead of `res.status === 200`).
// Both assertions fail against the pre-fix code:
//  - RolesUpdate used to parseInt the role value and the already-assigned
//    role, then call assignRoleToUser/removeRoleFromUser with NaN.
//  - EditUserGroup used to check `res.status === 200`, which is never true
//    for a 204 (or a plain body with no `status` field), so it always
//    reported failure even on a successful PATCH.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: vi.fn() },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}))

const assignRoleToUser = vi.fn().mockResolvedValue(undefined)
const removeRoleFromUser = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/rbac', () => ({ assignRoleToUser, removeRoleFromUser }))

vi.mock('@/features/users/queries/users.query', () => ({
  allMembersQueryOptions: () => ({ queryKey: ['members'] }),
}))

vi.mock('@/features/users/hooks/useUsers', () => ({
  useRoles: () => ({
    data: [
      { slug: 'user', priority: 10, is_system: true, permissions: [], display_name_key: '', description_key: '' },
      { slug: 'admin', priority: 100, is_system: true, permissions: [], display_name_key: '', description_key: '' },
    ],
    error: undefined,
  }),
}))

const updateUserGroup = vi.fn()
vi.mock('@services/usergroups/usergroups', () => ({ updateUserGroup }))

describe('RolesUpdate role-assignment payload (v2)', () => {
  it('assigns/revokes roles by string user id and slug, not parsed integers', async () => {
    const { default: RolesUpdate } = await import('@/components/Objects/Modals/Dash/Users/RolesUpdate')

    render(
      <RolesUpdate
        user={{ id: '0198c0ae-0000-7000-8000-000000000001', username: 'alice' }}
        setRolesModal={vi.fn()}
        alreadyAssignedRole="user"
      />,
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'updateButton' }))

    await vi.waitFor(() => {
      expect(assignRoleToUser).toHaveBeenCalledWith('0198c0ae-0000-7000-8000-000000000001', 'admin')
    })
    expect(removeRoleFromUser).toHaveBeenCalledWith('0198c0ae-0000-7000-8000-000000000001', 'user')

    // Neither call may receive NaN (what `Number.parseInt(slug, 10)` produced pre-fix).
    for (const call of [...assignRoleToUser.mock.calls, ...removeRoleFromUser.mock.calls]) {
      expect(typeof call[0]).toBe('string')
      expect(typeof call[1]).toBe('string')
    }
  })
})

describe('EditUserGroup success detection (v2)', () => {
  it('reports success when the PATCH resolves without a 200 status field (204/body response)', async () => {
    updateUserGroup.mockReset().mockResolvedValue({ id: 'group-1', name: 'Team', description: '' })
    const { toast } = await import('sonner')
    const { default: EditUserGroup } = await import('@/components/Objects/Modals/Dash/UserGroups/EditUserGroup')

    render(<EditUserGroup usergroup={{ id: 'group-1', name: 'Team', description: '' }} />)

    fireEvent.click(screen.getByRole('button', { name: 'saveButton' }))

    await vi.waitFor(() => {
      expect(updateUserGroup).toHaveBeenCalledWith('group-1', expect.objectContaining({ name: 'Team' }))
    })
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('toastSuccess')
    })
    expect(toast.error).not.toHaveBeenCalled()
  })
})
