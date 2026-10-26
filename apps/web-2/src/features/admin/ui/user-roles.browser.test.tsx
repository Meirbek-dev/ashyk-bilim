import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AdminUser, Role } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { UserRoles } from './user-roles'

const role = (slug: string, key: string): Role => ({
  slug,
  display_name_key: `roles.${key}.name`,
  description_key: `roles.${key}.description`,
  display_name: null,
  description: null,
  priority: 50,
  is_system: true,
  permissions: [],
  allowed_actions: ['assign'],
  version: 1,
})

const user: AdminUser = {
  id: '0190a5d2-0000-7000-8000-000000000071',
  username: 'aigerim',
  display_name: 'Айгерим Сапарова',
  email: 'aigerim@example.kz',
  avatar_key: null,
  organization: '',
  created_at_unix: 1_790_000_000,
  status: 'active',
  roles: ['instructor', 'user'],
  allowed_actions: ['manage_roles'],
}

afterEach(() => vi.unstubAllGlobals())

describe('UserRoles', () => {
  test('B-ADM-04 removing a role asks first, naming the role and the user; only the confirmation sends it', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (input: Request) => {
      calls.push(`${input.method} ${new URL(input.url).pathname}`)
      if (input.method === 'DELETE') return Promise.resolve(Response.json({ ...user, roles: ['user'] }))
      return Promise.resolve(Response.json([role('instructor', 'instructor'), role('user', 'user')]))
    })
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <Suspense>
          <UserRoles user={user} />
        </Suspense>
      </QueryClientProvider>,
    )
    const instructor = m.admin_role_instructor()
    await screen.getByRole('button', { name: m.admin_user_role_remove({ role: instructor }) }).click()
    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByText(m.admin_user_role_remove_title({ role: instructor, name: user.display_name })))
      .toBeVisible()
    expect(calls.some(call => call.startsWith('DELETE'))).toBe(false)
    await dialog.getByRole('button', { name: m.admin_user_role_remove_confirm() }).click()
    await expect.poll(() => calls).toContain(`DELETE /api/v2/users/${user.id}/roles/instructor`)
  })
})
