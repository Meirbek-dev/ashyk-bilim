import { describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { GrantRows } from './grant-rows'
import { RolePermissionList } from './role-permission-list'

describe('RolePermissionList', () => {
  test('B-ADM-09 grants read in words under their resource; the grant as sent is the tooltip', async () => {
    const screen = await renderInRouter(
      <RolePermissionList permissions={['course:create:platform', 'course:read:all', 'activity:update:own']} />,
    )
    await expect.element(screen.getByRole('term').filter({ hasText: m.admin_perm_resource_course() })).toBeVisible()
    await expect
      .element(screen.getByTitle('course:create:platform'))
      .toHaveTextContent(`${m.admin_perm_action_create()} · ${m.admin_perm_scope_platform()}`)
    await expect.element(screen.getByText('course:read:all', { exact: true })).not.toBeInTheDocument()
  })

  test('B-ADM-09 the wildcard reads «Все разделы» / «Все действия»; an unknown grant is shown as sent', async () => {
    const screen = await renderInRouter(<RolePermissionList permissions={['*:*:*', 'robot:fly:own']} />)
    await expect.element(screen.getByRole('term').first()).toHaveTextContent(m.admin_perm_resource_any())
    await expect
      .element(screen.getByTitle('*:*:*'))
      .toHaveTextContent(`${m.admin_perm_action_any()} · ${m.admin_perm_scope_any()}`)
    await expect.element(screen.getByText('robot:fly:own', { exact: true })).toBeVisible()
  })
})

describe('GrantRows', () => {
  test('B-ADM-11 each grant is three pickers; a pick, a removal and «Добавить право» change the list', async () => {
    const onChange = vi.fn<(grants: string[]) => void>()
    const screen = await renderInRouter(
      <GrantRows grants={['course:read:all', 'quiz:*:own']} refused={[]} disabled={false} onChange={onChange} />,
    )
    await expect
      .element(screen.getByRole('combobox', { name: m.admin_perm_field_action() }).first())
      .toHaveValue('read')
    await screen.getByRole('combobox', { name: m.admin_perm_field_scope() }).nth(1).selectOptions('platform')
    expect(onChange).toHaveBeenLastCalledWith(['course:read:all', 'quiz:*:platform'])
    await screen.getByRole('button', { name: m.admin_perm_remove() }).first().click()
    expect(onChange).toHaveBeenLastCalledWith(['quiz:*:own'])
    await screen.getByRole('button', { name: m.admin_perm_add() }).click()
    expect(onChange).toHaveBeenLastCalledWith(['course:read:all', 'quiz:*:own', 'course:read:*'])
  })

  test('B-ADM-11 a refused grant is marked with a line under the rows', async () => {
    const screen = await renderInRouter(
      <GrantRows
        grants={['course:read:all']}
        refused={['course:read:all']}
        disabled={false}
        onChange={vi.fn<(grants: string[]) => void>()}
      />,
    )
    await expect.element(screen.getByRole('alert')).toHaveTextContent(m.admin_role_permissions_refused())
  })
})
