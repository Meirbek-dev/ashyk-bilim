export interface VersionedStorageEnvelope<T> {
  version: number
  value: T
  updatedAt: number
}

function canUseLocalStorage(): boolean {
  return typeof globalThis.window !== 'undefined' && typeof globalThis.localStorage !== 'undefined'
}

export function readLocalStorageString(
  key: string,
  allowedValues?: readonly string[],
): string | null {
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

export function readJsonLocalStorage<T>(
  key: string,
  validate: (value: unknown) => value is T,
): T | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = globalThis.localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return validate(parsed) ? parsed : null
  } catch {
    return null
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

export function readVersionedLocalStorage<T>(
  key: string,
  version: number,
  validate: (value: unknown) => value is T,
): T | null {
  const envelope = readJsonLocalStorage<VersionedStorageEnvelope<T>>(
    key,
    (value): value is VersionedStorageEnvelope<T> => {
      if (typeof value !== 'object' || value === null) return false
      const candidate = value as Partial<VersionedStorageEnvelope<T>>
      return (
        typeof candidate.version === 'number' &&
        candidate.version === version &&
        validate(candidate.value)
      )
    },
  )

  return envelope?.value ?? null
}

export function writeVersionedLocalStorage(key: string, version: number, value: unknown): void {
  writeJsonLocalStorage(key, {
    version,
    value,
    updatedAt: Date.now(),
  } satisfies VersionedStorageEnvelope<unknown>)
}
