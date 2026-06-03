'use server'

import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client'
import type { CustomResponseTyping } from '@/lib/api-client'
import { getServerAPIUrl } from '@services/config/config'
import type { components } from '@/lib/api/generated'
import { tags } from '@/lib/cacheTags'
import { requireSession } from '@/lib/auth/session'

type PlatformRead = components['schemas']['PlatformRead']
type PlatformDetailResponse = components['schemas']['PlatformDetailResponse']

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null
}

async function getTypedResponseMetadata<T>(response: Response): Promise<ResponseMetadata<T>> {
  return await getResponseMetadata(response)
}

async function fetchPlatform(): Promise<PlatformRead | null> {
  try {
    const result = await apiFetch('platform', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      baseUrl: getServerAPIUrl(),
      timeoutMs: 8000,
    })
    return await errorHandling(result)
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


export async function removeUser(user_id: number): Promise<ResponseMetadata<PlatformDetailResponse>> {
  await requireSession()
  const result = await apiFetch(`members/${user_id}`, { method: 'DELETE' })
  const metadata = await getTypedResponseMetadata<PlatformDetailResponse>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.platform, 'max')
    revalidateTag(tags.users, 'max')
  }

  return metadata
}
