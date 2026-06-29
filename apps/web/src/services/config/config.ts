import { getPublicConfig, getServerConfigResult } from './env'

const toAbsoluteUrl = (path: string, baseUrl: string) => new URL(path, baseUrl).toString()

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
