// Plain isomorphic functions, NOT server actions: problem+json codes and
// field errors must reach the client `useApiError` (GAUNTLET BUG-035, UX-242).
// Nothing reads these cache tags (no `cacheTag()` consumer), so nothing is revalidated.
import { apiResult } from '@/lib/api-client'
import type { CreateUsergroupRequest, UpdateUsergroupRequest, Usergroup } from '@/lib/api/generated/zod'

const json = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function createUserGroup(body: CreateUsergroupRequest) {
  return apiResult<Usergroup>('usergroups', { method: 'POST', ...json(body) })
}

export async function linkUserToUserGroup(usergroup_id: string, user_id: string) {
  return apiResult<void>(`usergroups/${usergroup_id}/members`, { method: 'POST', ...json({ user_ids: [user_id] }) })
}

export async function unLinkUserToUserGroup(usergroup_id: string, user_id: string) {
  return apiResult<void>(`usergroups/${usergroup_id}/members`, { method: 'DELETE', ...json({ user_ids: [user_id] }) })
}

export async function updateUserGroup(usergroup_id: string, data: UpdateUsergroupRequest) {
  return apiResult<Usergroup>(`usergroups/${usergroup_id}`, { method: 'PATCH', ...json(data) })
}

export async function deleteUserGroup(usergroup_id: string) {
  return apiResult<void>(`usergroups/${usergroup_id}`, { method: 'DELETE' })
}

export async function linkResourcesToUserGroup(usergroup_id: string, course_ids: string[]) {
  return apiResult<void>(`usergroups/${usergroup_id}/courses`, { method: 'POST', ...json({ course_ids }) })
}

export async function unLinkResourcesToUserGroup(usergroup_id: string, course_ids: string[]) {
  return apiResult<void>(`usergroups/${usergroup_id}/courses`, { method: 'DELETE', ...json({ course_ids }) })
}
