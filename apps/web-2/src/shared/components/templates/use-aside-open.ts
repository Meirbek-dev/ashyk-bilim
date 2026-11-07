import { useSyncExternalStore } from 'react'
import * as v from 'valibot'

import { storageItem } from '#/shared/lib/storage'

const saved = storageItem('ab.focus-aside', v.boolean())
const listeners = new Set<() => void>()

/** Storage can be missing (private windows): the panel then stays closed and the choice lasts for the page. */
let current: boolean | null = null
function read(): boolean {
  if (current !== null) return current
  try {
    current = saved.get() ?? false
  } catch {
    current = false
  }
  return current
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function write(open: boolean) {
  current = open
  try {
    saved.set(open)
  } catch {
    // Not remembered; the page still follows the click.
  }
  for (const listener of listeners) listener()
}

/**
 * Whether the focus layout's right panel (the AI helper) stands open on a wide screen: closed until asked for, then
 * remembered in this browser. Open by default it took a third of every lesson and every review, for a tool most people
 * use now and then; the server render and hydration both start closed.
 */
export function useAsideOpen(): [boolean, (open: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, () => false), write]
}
