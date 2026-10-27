import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Usergroup, UsergroupMember } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { GroupMemberRow } from './group-member-row'

const group: Usergroup = {
  id: '0190a5d2-0000-7000-8000-000000000081',
  name: '9А класс',
  description: '',
  member_count: 1,
  allowed_actions: ['manage_members'],
  can_write: true,
  created_at_unix: 1_790_000_000,
  updated_at_unix: 1_790_000_000,
  creator_id: null,
  version: 1,
}
const member: UsergroupMember = {
  id: '0190a5d2-0000-7000-8000-000000000082',
  username: 'dana',
  display_name: 'Дана Серикова',
  avatar_key: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('GroupMemberRow', () => {
  test('B-ADM-19 removing a member asks first, naming them and the group; only the confirmation sends it', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (input: Request) => {
      calls.push(input.method)
      return Promise.resolve(Response.json({ ...group, member_count: 0 }))
    })
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <ul>
          <GroupMemberRow group={group} member={member} manage />
        </ul>
      </QueryClientProvider>,
    )
    await screen.getByRole('button', { name: m.admin_group_member_remove({ name: member.display_name }) }).click()
    const dialog = screen.getByRole('alertdialog')
    await expect
      .element(dialog.getByText(m.admin_group_member_remove_title({ name: member.display_name, group: group.name })))
      .toBeVisible()
    expect(calls).toEqual([])
    await dialog.getByRole('button', { name: m.admin_group_member_remove_confirm() }).click()
    await expect.poll(() => calls.length).toBeGreaterThan(0)
  })
})
