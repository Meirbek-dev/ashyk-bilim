'use server'

import { apiJson, apiResult } from '@/lib/api-client'
import { getServerAPIUrl } from '@services/config/config'
import type { components } from '@/lib/api/generated'
import { tags } from '@/lib/cacheTags'
import { requireSession } from '@/lib/auth/session'

type PlatformRead = components['schemas']['PlatformRead']
type PlatformDetailResponse = components['schemas']['PlatformDetailResponse']

async function fetchPlatform(): Promise<PlatformRead | null> {
  try {
    return await apiJson<PlatformRead>('platform', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      baseUrl: getServerAPIUrl(),
      timeoutMs: 8000,
    })
  } catch {
    return null
  }
}

/**
 * Get the single platform configuration.
 * This is a PUBLIC endpoint used for bootstrapping the UI.
 */
export async function getPlatform() {
  return fetchPlatform()
}

export async function removeUser(user_id: number) {
  await requireSession()
  const data = await apiResult<PlatformDetailResponse>(`members/${user_id}`, { method: 'DELETE' })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')
  revalidateTag(tags.users, 'max')

  return data
}
