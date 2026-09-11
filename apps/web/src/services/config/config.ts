import { getPublicConfig, getServerConfigResult } from './env'

// An empty path yields the bare origin (no trailing slash) so callers can append
// `/course/...` without producing `//course/...` (BUG-033a).
const toAbsoluteUrl = (path: string, baseUrl: string) =>
  path ? new URL(path, baseUrl).toString() : new URL(baseUrl).origin

/**
 * Resolves the API base URL (always ending with a slash).
 * Shared code should use getAPIUrl(). It resolves to the public browser URL
 * on the client and the internal Docker/backend URL on the server.
 * Server-only code can use getServerAPIUrl() explicitly when needed.
 */
export const getPublicAPIUrl = () => getPublicConfig().apiUrl

export const getServerAPIUrl = () => {
  const serverConfigResult = getServerConfigResult()
  if (serverConfigResult.success && serverConfigResult.config.internalApiUrl) {
    return serverConfigResult.config.internalApiUrl
  }

  return getPublicAPIUrl()
}

export const getAPIUrl = () => {
  if (typeof globalThis.window === 'undefined') {
    return getServerAPIUrl()
  }

  return getPublicAPIUrl()
}

export const getSiteUrl = () => getPublicConfig().siteUrl

export const getBackendUrl = () => getSiteUrl()

export const getAbsoluteUrl = (path: string) => toAbsoluteUrl(path, getSiteUrl())

export const getTopLevelCookieDomain = () => {
  const serverConfigResult = getServerConfigResult()
  if (serverConfigResult.success) {
    return serverConfigResult.config.cookieDomain
  }
  return undefined
}
