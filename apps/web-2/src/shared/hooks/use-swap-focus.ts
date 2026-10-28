import { useRef } from 'react'

/**
 * A control an action replaces with another («Включить» ↔ «Отключить»): without help the focus falls to the page
 * with the control that had it, and a keyboard or screen-reader user starts over from the top.
 *
 * `mark(key)` names the control to show next, before the action (its result may render before the action's promise
 * settles); `focusOn(key)` is the ref of the wrapper around the control shown for `key`. When that wrapper mounts after
 * a `mark(key)`, it takes the focus itself when it is a button or has a `tabIndex` (a form the user starts reading),
 * else its first button does; once: a later render never takes it again, so a refetch cannot pull the focus back from
 * wherever the user went.
 */
export function useSwapFocus<Key extends string>() {
  const next = useRef<Key | null>(null)
  return {
    mark: (key: Key) => {
      next.current = key
    },
    focusOn: (key: Key) => (node: HTMLElement | null) => {
      if (node === null || next.current !== key) return
      next.current = null
      const target = node.matches('button') || node.hasAttribute('tabindex') ? node : node.querySelector('button')
      target?.focus()
    },
  }
}
