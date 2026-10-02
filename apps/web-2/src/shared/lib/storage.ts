import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import * as v from 'valibot'

type StorageKey = `ab.${string}`

/** The only door to browser storage: a typed, namespaced key whose value is checked on every read. */
export function storageItem<T>(key: StorageKey, schema: v.GenericSchema<T>, area: 'local' | 'session' = 'local') {
  const store = () => (area === 'local' ? localStorage : sessionStorage)
  return {
    get(): T | null {
      const raw = store().getItem(key)
      if (raw === null) return null
      try {
        const parsed = v.safeParse(schema, JSON.parse(raw))
        return parsed.success ? parsed.output : null
      } catch {
        return null // not JSON: written by an older build or by hand
      }
    },
    set(value: T): void {
      store().setItem(key, JSON.stringify(value))
    },
  }
}

type CookieName = `ab_${string}`

const ONE_YEAR = 60 * 60 * 24 * 365

const readCookie = createIsomorphicFn()
  .server((name: string) => getCookie(name))
  .client((name: string) => {
    const prefix = `${name}=`
    const raw = document.cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(prefix))
    return raw === undefined ? undefined : decodeURIComponent(raw.slice(prefix.length))
  })

/**
 * A preference the server must see while it renders (theme, mode; spec 7.8): a cookie the browser writes
 * and SSR reads from the request. Readable on both sides, writable in the browser only.
 */
export function cookieItem<T extends string>(name: CookieName, schema: v.GenericSchema<string, T>) {
  return {
    get(): T | null {
      const parsed = v.safeParse(schema, readCookie(name))
      return parsed.success ? parsed.output : null
    },
    set(value: T): void {
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`
    },
  }
}
