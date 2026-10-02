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
