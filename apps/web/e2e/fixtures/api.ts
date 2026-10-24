import { request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { BrowserContext } from '@playwright/test'
import { STORAGE_STATE } from '../auth-states'
import { getEnvOr } from '../env'

/** Setup uses the real API; each independent spec owns and removes its own resources. */
export const apiAs = (role: keyof typeof STORAGE_STATE) => {
  const state = JSON.parse(readFileSync(STORAGE_STATE[role], 'utf8')) as Awaited<
    ReturnType<BrowserContext['storageState']>
  >
  return request.newContext({
    baseURL: `${getEnvOr('E2E_API_URL', 'http://localhost:8000/api/v2').replace(/\/+$/, '')}/`,
    extraHTTPHeaders: {
      cookie: state.cookies
        .filter(cookie => cookie.name === 'ab_session')
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; '),
    },
    ignoreHTTPSErrors: process.env.E2E_INSECURE === '1',
  })
}
