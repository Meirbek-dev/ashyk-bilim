import { useDebouncer } from '@tanstack/react-pacer'
import { useState } from 'react'

/**
 * A value that clears itself `wait` ms after it was last set: the controls' "recently active" mark, the seek and
 * volume feedback, the resume notice.
 */
export function useQuietValue<T>(wait: number) {
  const [value, setValue] = useState<T | null>(null)
  const later = useDebouncer(() => setValue(null), { wait })
  const set = (next: T) => {
    setValue(next)
    later.maybeExecute()
  }
  const clear = () => {
    later.cancel()
    setValue(null)
  }
  return { value, set, clear }
}
