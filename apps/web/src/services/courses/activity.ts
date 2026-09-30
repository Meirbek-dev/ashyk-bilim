'use server'

import { apiJson } from '@/lib/api-client'
import { Trail } from '@/lib/api/generated/zod'
import { toAppTrail } from '@/hooks/courses/courseKeys'

/*
 Trail (progress) mutations. Every route answers with the caller's full `Trail`.
*/

export async function getCurrentTrail(): Promise<AppTrailData | null> {
  try {
    return toAppTrail(await apiJson('trail', { method: 'GET' }, value => Trail.parse(value)))
  } catch {
    return null
  }
}
