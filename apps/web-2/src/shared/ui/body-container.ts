import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

// ui-sdk renders a popup in place, under the styles (prose headings, a cell's text) and the form around its trigger.
// The body takes it instead once hydrated; null on the server and while hydrating, so the markup matches.
function useBodyContainer(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => document.body,
    () => null,
  )
}

/**
 * A popup root's container and open state. A popup open from the first render (`?create=true`, `?ai=chat`) waits for
 * hydration: open on the server it would sit in place, then move to the body and remount its content, emptying what
 * was typed and losing the focus it took; closed until then, it opens on the client like any other. `defaultOpen` is
 * not held back: use `open` for a popup a URL opens.
 */
export function usePopupRoot<C>(container: C | undefined, open: boolean | undefined) {
  const body = useBodyContainer()
  return { container: container ?? body, open: open === undefined || body ? open : false }
}
