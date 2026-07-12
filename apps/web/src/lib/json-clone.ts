export function cloneJsonValue<T>(value: T): T {
  const clone = globalThis.structuredClone
  if (typeof clone === 'function') {
    return clone(value)
  }

  const serialized = JSON.stringify(value)
  return JSON.parse(serialized) as T
}
