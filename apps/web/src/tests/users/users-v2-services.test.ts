import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { apiJson, apiResult } from '@/lib/api-client'
import { APIError } from '@/lib/api/assertSuccess'
import { getUserByUsername } from '@/services/users/users'
import { linkResourcesToUserGroup, linkUserToUserGroup, unLinkUserToUserGroup } from '@/services/usergroups/usergroups'
import { createCertification, getCertificateByCode, updateCertification } from '@/services/courses/certifications'
import { allMembersQueryOptions, userGroupUsersQueryOptions } from '@/features/users/queries/users.query'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiResult: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/users/client', () => ({
  getCoursesByUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  userKeys: { byId: vi.fn(), byUsername: vi.fn(), coursesByUser: vi.fn() },
}))
vi.mock('@services/rbac', () => ({
  listRoles: vi.fn(),
  listUsers: vi.fn(),
}))
vi.mock('@/lib/react-query/queryKeys', () => ({
  queryKeys: {
    userGroups: { all: () => ['ug'], users: (id: string) => ['ug', id] },
    users: { admin: () => ['users'], roles: () => ['roles'] },
  },
}))

const group = '01a08bdf-c95f-75d8-bf08-bb079a77a583'
const user = '01a08bd6-a04f-76ac-92cd-4daaf9a31de7'
const course = '01a08bd6-a04f-7706-9d43-fc87194bef1d'
const runQuery = <T>(options: { queryFn?: unknown }) => (options.queryFn as () => Promise<T>)()

beforeEach(() => vi.resetAllMocks())

describe('users (v2)', () => {
  it('resolves a public profile through GET /users/{username} (anonymous-readable card)', async () => {
    vi.mocked(apiJson).mockResolvedValue({ id: user, username: 'teacher', display_name: 'Daniyar Teacher', avatar_key: 'a/b.png' })
    const profile = await getUserByUsername('Teacher')
    expect(apiJson).toHaveBeenCalledWith('users/Teacher')
    expect(profile).toMatchObject({ id: user, username: 'teacher', first_name: 'Daniyar Teacher', avatar_key: 'a/b.png' })
  })

  it('maps an unknown username (404) to null, not a load failure', async () => {
    vi.mocked(apiJson).mockRejectedValue(new APIError({ code: 'not-found', message: 'user', status: 404 }))
    await expect(getUserByUsername('nobody')).resolves.toBeNull()
  })
})

describe('usergroups (v2)', () => {
  it('adds and removes members through /usergroups/{id}/members with a JSON body', async () => {
    vi.mocked(apiResult).mockResolvedValue({ data: undefined, headers: {}, requestId: null, status: 204, statusText: '' })
    await linkUserToUserGroup(group, user)
    expect(apiResult).toHaveBeenLastCalledWith(
      `usergroups/${group}/members`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ user_ids: [user] }) }),
    )
    await unLinkUserToUserGroup(group, user)
    expect(apiResult).toHaveBeenLastCalledWith(`usergroups/${group}/members`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('links courses through /usergroups/{id}/courses', async () => {
    vi.mocked(apiResult).mockResolvedValue({ data: undefined, headers: {}, requestId: null, status: 204, statusText: '' })
    await linkResourcesToUserGroup(group, [course])
    expect(apiResult).toHaveBeenLastCalledWith(
      `usergroups/${group}/courses`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ course_ids: [course] }) }),
    )
  })

  it('lists members from /usergroups/{id}/members and walks admin user pages by cursor', async () => {
    vi.mocked(apiJson)
      .mockResolvedValueOnce([{ id: user, username: 'teacher', display_name: 'T' }])
      .mockResolvedValueOnce({ items: [{ id: 'a' }], next_cursor: 'a' })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], next_cursor: null })
    const members = await runQuery<{ id: string }[]>(userGroupUsersQueryOptions(group))
    expect(apiJson).toHaveBeenNthCalledWith(1, `usergroups/${group}/members`)
    expect(members[0]?.id).toBe(user)
    const all = await runQuery<{ id: string }[]>(allMembersQueryOptions())
    expect(apiJson).toHaveBeenNthCalledWith(2, 'users?limit=100')
    expect(apiJson).toHaveBeenNthCalledWith(3, 'users?limit=100&cursor=a')
    expect(all.map(row => row.id)).toEqual(['a', 'b'])
  })
})

describe('certifications (v2)', () => {
  it('creates with {course_id, config}, patches {config}, verifies by code', async () => {
    vi.mocked(apiJson).mockResolvedValue({})
    vi.mocked(apiResult).mockResolvedValue({ data: {}, headers: {}, requestId: null, status: 200, statusText: '' })
    await createCertification({ course_id: course, config: { a: 1 }, options: { courseUuid: course } })
    expect(apiJson).toHaveBeenLastCalledWith(
      'certifications',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ course_id: course, config: { a: 1 } }) }),
    )
    await updateCertification({ certification_id: 'cert-1', config: { a: 2 } })
    expect(apiJson).toHaveBeenLastCalledWith(
      'certifications/cert-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ config: { a: 2 } }) }),
    )
    await getCertificateByCode('ABCD-1234')
    expect(apiResult).toHaveBeenLastCalledWith('certificates/ABCD-1234')
  })
})
