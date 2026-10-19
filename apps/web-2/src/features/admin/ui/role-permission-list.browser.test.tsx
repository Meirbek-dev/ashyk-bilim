import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { RolePermissionList } from './role-permission-list'

describe('RolePermissionList', () => {
  test('B-ADM-09 grants are grouped by resource and shown as the server sends them, never reworded (R-06)', async () => {
    const screen = await renderInRouter(
      <RolePermissionList permissions={['course:create:platform', 'course:read:all', 'activity:update:own']} />,
    )
    await expect.element(screen.getByRole('term').filter({ hasText: /^course$/ })).toBeVisible()
    for (const grant of ['course:create:platform', 'course:read:all', 'activity:update:own'])
      await expect.element(screen.getByText(grant, { exact: true })).toBeVisible()
  })

  test('B-ADM-09 the wildcard resource reads «Все права»; its grant stays as sent', async () => {
    const screen = await renderInRouter(<RolePermissionList permissions={['*:*:*']} />)
    await expect.element(screen.getByRole('term')).toHaveTextContent(m.admin_role_permissions_all())
    await expect.element(screen.getByText('*:*:*', { exact: true })).toBeVisible()
  })
})
