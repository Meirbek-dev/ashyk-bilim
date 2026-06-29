import { useCallback, useEffect, useRef, useState } from 'react'

export function useDebouncedValue<T>(value: T, delay: number): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setDebouncedValue(value), delay)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value, delay])

  return debouncedValue
}

export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => unknown,
  delay: number,
): (...args: Args) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    },
    [delay],
  )
}
