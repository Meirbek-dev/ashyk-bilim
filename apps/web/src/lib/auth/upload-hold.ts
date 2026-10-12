/**
 * Uploads a sign-out would lose (`uploadFile`: the bytes may already be in
 * storage, only the finalize is left). While one runs, a 401 anywhere (another
 * request of the page, the upload itself) does not send the browser to /login:
 * `expired` turns on, SessionExpiredUploadNotice offers to sign in in a new tab
 * and its «Повторить» lets the waiting upload step run again. The last release
 * with the session still gone hands over to the ordinary login redirect.
 */
let holds = 0
let expired = false
const listeners = new Set<() => void>()
let waiters: (() => void)[] = []

function setExpired(value: boolean) {
  if (expired === value) return
  expired = value
  for (const listener of listeners) listener()
}

/** The release (once) returns true when it was the last hold and the session is still gone. */
export function holdUploadSession(): () => boolean {
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

export const uploadSessionHeld = (): boolean => holds > 0

export const noteUploadSessionExpired = (): void => setExpired(true)

/** Resolves when the user presses «Повторить» in the notice; rejects when `signal` aborts first. */
export function waitForSignIn(signal?: AbortSignal): Promise<void> {
  noteUploadSessionExpired()
  return new Promise((resolve, reject) => {
    const abort = () => {
      waiters = waiters.filter(waiter => waiter !== done)
      reject(signal?.reason)
    }
    const done = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    waiters.push(done)
  })
}

/** The notice's «Повторить»: the waiting uploads try their step again (a new 401 shows the notice again). */
export function retryAfterSignIn(): void {
  const waiting = waiters
  waiters = []
  setExpired(false)
  for (const done of waiting) done()
}

export const uploadSessionExpired = (): boolean => expired

export function subscribeUploadSessionExpired(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
