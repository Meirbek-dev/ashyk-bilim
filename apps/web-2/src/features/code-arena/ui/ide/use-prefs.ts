import { useSyncExternalStore } from 'react'

import { storageItem } from '#/shared/lib/storage'

import { DEFAULT_PREFS, prefsSchema, type EditorPrefs } from '../../model/ide'

const saved = storageItem('ab.code-editor', prefsSchema)
const listeners = new Set<() => void>()
let current: EditorPrefs | null = null

/** Storage can be missing or full (private windows, quotas): the editor then just does not remember. */
function read(): EditorPrefs {
  if (current) return current
  try {
    current = saved.get() ?? DEFAULT_PREFS
  } catch {
    current = DEFAULT_PREFS
  }
  return current
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function update(patch: Partial<EditorPrefs>) {
  const next = { ...read(), ...patch }
  current = next
  try {
    saved.set(next)
  } catch {
    // Not remembered; this page still uses it.
  }
  for (const listener of listeners) listener()
}

/** The editor settings and the divider position, the same on every challenge and remembered (B-COD-30). */
export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS)
  return { prefs, update }
}
