import { defaultLocale, localePrefixes, locales } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

const COOKIE_NAME = 'NEXT_LOCALE'
const localeByPrefix = Object.fromEntries(
  Object.entries(localePrefixes).map(([locale, prefix]) => [prefix.slice(1), locale]),
) as Record<string, Locale>

function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale)
}

function getLocaleFromPathname(pathname: string | undefined): Locale | undefined {
  const prefix = pathname?.split('/')[1]
  if (prefix && localeByPrefix[prefix]) return localeByPrefix[prefix]
  return isLocale(prefix) ? prefix : undefined
}

export async function getUserLocale(cookieStore?: {
  get: (name: string) => { value?: string } | undefined
}) {
  try {
    if (typeof globalThis.window !== 'undefined') {
      const pathLocale = getLocaleFromPathname(globalThis.location.pathname)
      if (pathLocale) return pathLocale
    }

    if (cookieStore && typeof cookieStore.get === 'function') {
      const c = cookieStore.get(COOKIE_NAME)
      if (isLocale(c?.value)) return c.value
    }
  } catch {
    // Fall through to the default locale for non-browser and constrained contexts.
  }

  return defaultLocale
}

export async function setUserLocale(locale: Locale) {
  if (typeof document === 'undefined') {
    throw new Error('setUserLocale can only be called in the browser')
  }

  try {
    const value = encodeURIComponent(locale)
    document.cookie = `${COOKIE_NAME}=${value}; Path=/; SameSite=Lax`
  } catch (error) {
    console.error('[setUserLocale] Failed to set cookie:', error)
  }
}
