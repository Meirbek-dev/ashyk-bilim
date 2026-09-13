'use server'

import { apiJson } from '@/lib/api-client'
import { getServerAPIUrl } from '@services/config/config'
import type { Platform } from '@/lib/api/generated/zod'

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
