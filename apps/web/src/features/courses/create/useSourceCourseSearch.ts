import { useState, useCallback, useRef, useEffect } from 'react'
import { searchEditableCourses } from '@services/courses/courses'
import { cleanCourseUuid } from '@/lib/course-management'
import type { SourceCourseOption } from './course-create-types'

type SearchState = 'idle' | 'loading' | 'success' | 'error'

interface UseSourceCourseSearchReturn {
  query: string
  options: SourceCourseOption[]
  state: SearchState
  search: (q: string) => void
  clear: () => void
}

export function useSourceCourseSearch(initialQuery = ''): UseSourceCourseSearchReturn {
  const [query, setQuery] = useState(initialQuery)
  const [options, setOptions] = useState<SourceCourseOption[]>([])
  const [state, setState] = useState<SearchState>('idle')
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestQueryRef = useRef<string>('')

  const execute = useCallback(async (q: string) => {
    // Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    const capturedQuery = q

    setState('loading')
    try {
      const results = await searchEditableCourses(q, 20)
      // Only update if this is still the latest request
      if (!controller.signal.aborted && capturedQuery === latestQueryRef.current) {
        setOptions(
          results.map(c => ({
            courseUuid: cleanCourseUuid(c.course_uuid),
            name: c.name,
          })),
        )
        setState('success')
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      if (!controller.signal.aborted && capturedQuery === latestQueryRef.current) {
        setOptions([])
        setState('error')
      }
    }
  }, [])

  const search = useCallback(
    (q: string) => {
      setQuery(q)
      latestQueryRef.current = q

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        execute(q)
      }, 300)
    },
    [execute],
  )

  const clear = useCallback(() => {
    setQuery('')
    setOptions([])
    setState('idle')
    latestQueryRef.current = ''
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const initialQueryRef = useRef(initialQuery)

  // Initial load on mount (empty query shows recent courses)
  useEffect(() => {
    latestQueryRef.current = initialQueryRef.current
    void execute(initialQueryRef.current)
  }, [execute])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return { query, options, state, search, clear }
}
