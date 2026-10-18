import { describe, expect, test } from 'vite-plus/test'

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
})
