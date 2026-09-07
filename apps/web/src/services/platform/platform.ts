'use server'

import { apiJson, apiResult } from '@/lib/api-client'
import { getServerAPIUrl } from '@services/config/config'
import type { Platform } from '@/lib/api/generated/zod'
import { tags } from '@/lib/cacheTags'
import { requireSession } from '@/lib/auth/session'

async function fetchPlatform(): Promise<Platform | null> {
  try {
    return await apiJson<Platform>('platform', {
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

export async function removeUser(userId: string) {
  await requireSession()
  const data = await apiResult<void>(`users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabled: true }),
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.platform, 'max')
  revalidateTag(tags.users, 'max')

  return data
}
