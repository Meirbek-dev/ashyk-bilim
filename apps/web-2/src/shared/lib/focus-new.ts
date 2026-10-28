import { useRef } from 'react'

/**
 * «Добавить …» that appends a row moves focus into the new row's first text field, not left on the button.
 * `added(row)` wraps the row being appended; `ref(row)` on that row's element focuses its field once, on mount.
 */
export function useFocusNew<Row>(key: (row: Row) => string) {
  const pending = useRef<string | null>(null)
  return {
    added: (row: Row): Row => {
      pending.current = key(row)
      return row
    },
    ref: (row: Row) => (element: HTMLElement | null) => {
      if (!element || pending.current !== key(row)) return
      pending.current = null
      // A text field: a radio or checkbox mark keeps a hidden native input of its own.
      element.querySelector<HTMLElement>('input:not([type]), input[type="text"], textarea')?.focus()
    },
  }
}
