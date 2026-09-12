'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { getAPIUrl } from '@services/config/config'

/** Named SSE events on `GET courses/{id}/grading/events`. */
export const GRADING_EVENT_NAMES = ['submission.submitted', 'grade.saved', 'grade.published', 'submission.returned'] as const

export function courseGradingEventsUrl(courseId: string) {
  return `${getAPIUrl().replace(/\/+$/, '')}/courses/${courseId}/grading/events`
}

/**
 * Follows the course-wide grading stream (graders only) and invalidates every
 * `queryKeys.grading.*` and file-submission review query on each event, so
 * the gradebook and review pages refresh without polling. Returns whether the
 * stream is live — callers keep interval polling only while it is not.
 * `EventSource` reconnects on its own after an error.
 */
export function useCourseGradingEvents(courseId: string | null | undefined): boolean {
  const queryClient = useQueryClient()
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!courseId || typeof EventSource === 'undefined') return
    const source = new EventSource(courseGradingEventsUrl(courseId), { withCredentials: true })
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['grading'] })
      void queryClient.invalidateQueries({ queryKey: ['file-submission'] })
    }
    source.addEventListener('connected', () => setLive(true))
    for (const name of GRADING_EVENT_NAMES) source.addEventListener(name, invalidate)
    source.onerror = () => setLive(false)
    return () => {
      source.close()
      setLive(false)
    }
  }, [courseId, queryClient])

  return live
}
