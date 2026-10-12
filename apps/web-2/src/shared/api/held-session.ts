import { useSyncExternalStore } from 'react'

// Uploads a sign-out would lose: a running one, or one whose bytes are stored and wait for a finalize after signing
// in again (`useUpload`, `FileInput`). While one is held, a lost session (a 401 of any read or write, the event
// stream, the upload itself) keeps the page: `expired` turns on and SessionExpiredNotice offers to sign in in a new
// tab. The last release with the session still gone hands over to the ordinary path (a 401 then signs out).

let holds = 0
let expired = false
const listeners = new Set<() => void>()

function setExpired(value: boolean): void {
  if (expired === value) return
  expired = value
  for (const listener of listeners) listener()
}

/**
 * Holds the page across a lost session. The release (once; later calls do nothing) returns true when it was the last
 * hold and the session is still gone: the caller then reads the session again.
 */
export function holdSession(): () => boolean {
  holds += 1
  let held = true
  return () => {
    if (!held) return false
    held = false
    holds -= 1
    if (holds > 0 || !expired) return false
    setExpired(false)
    return true
  }
}

export const sessionHeld = (): boolean => holds > 0

/** A 401 while an upload is held. */
export const noteSessionExpired = (): void => setExpired(true)

/** The session answered again (the user signed in in another tab). */
export const noteSessionBack = (): void => setExpired(false)

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** True while the session is gone but a held upload keeps the page. */
export const useSessionExpired = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => expired,
    () => false,
  )
