'use server'

import { apiJson } from '@/lib/api-client'
import { Trail } from '@/lib/api/generated/zod'
import { stripEntityPrefix, toAppTrail } from '@/hooks/courses/courseKeys'
import { tags } from '@/lib/cacheTags'

/*
 Trail (progress) mutations. Every route answers with the caller's full `Trail`.
*/

async function mutateTrail(path: string, method: 'POST' | 'DELETE'): Promise<AppTrailData> {
  const trail = await apiJson(path, { method }, Trail.parse)

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.courses, 'max')

  return toAppTrail(trail)
}

export async function markActivityAsComplete(activity_uuid: string) {
  return mutateTrail(`trail/activities/${stripEntityPrefix(activity_uuid)}`, 'POST')
}

export async function unmarkActivityAsComplete(activity_uuid: string) {
  return mutateTrail(`trail/activities/${stripEntityPrefix(activity_uuid)}`, 'DELETE')
}

export async function getCurrentTrail(): Promise<AppTrailData | null> {
  try {
    return toAppTrail(await apiJson('trail', { method: 'GET' }, Trail.parse))
  } catch {
    return null
  }
}
