export interface VersionedStorageEnvelope<T> {
  version: number
  value: T
  updatedAt: number
}

function canUseLocalStorage(): boolean {
  return typeof globalThis.window !== 'undefined' && typeof globalThis.localStorage !== 'undefined'
}

export function readLocalStorageString(key: string, allowedValues?: readonly string[]): string | null {
  if (!canUseLocalStorage()) return null

  try {
    const value = globalThis.localStorage.getItem(key)
    if (value === null) return null
    if (allowedValues && !allowedValues.includes(value)) return null
    return value
  } catch {
    return null
  }
}

export function writeLocalStorageString(key: string, value: string): void {
  if (!canUseLocalStorage()) return

  try {
    globalThis.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures in private browsing / quota exhaustion.
  }
}

export function writeJsonLocalStorage(key: string, value: unknown): void {
  if (!canUseLocalStorage()) return

  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage failures in private browsing / quota exhaustion.
  }
}
