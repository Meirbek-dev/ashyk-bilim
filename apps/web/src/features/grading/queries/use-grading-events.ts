'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getAPIUrl } from '@services/config/config'
import { useRouter } from '@/i18n/navigation'
import { handleBrowserUnauthenticated } from '@/lib/api-client'

/** Named SSE events on `GET courses/{id}/grading/events`. */
export const GRADING_EVENT_NAMES = [
  'submission.submitted',
  'grade.saved',
  'grade.published',
  'submission.returned',
] as const

const ACCESS_LOST_TOAST = 'grading-access-lost'

export function courseGradingEventsUrl(courseId: string) {
  return `${getAPIUrl().replace(/\/+$/, '')}/courses/${courseId}/grading/events`
}

export interface CourseGradingStream {
  /** The stream is connected — callers keep interval polling only while it is not. */
  live: boolean
  /** The server ended the stream with `closed` (grading access gone): callers disable grading controls. */
  accessLost: boolean
}

/**
 * Follows the course-wide grading stream (graders only) and invalidates every
 * `queryKeys.grading.*` and file-submission review query on each event, so
 * the gradebook and review pages refresh without polling. `EventSource`
 * reconnects on its own after an error.
 *
 * UX-216: a `closed` event (access lost mid-stream) flags `accessLost`, shows
 * a notice, refetches, and re-requests the stream to confirm: still refused →
 * `/unauthorized` (401 → login); accepted again → the stream reconnects.
 */
export function useCourseGradingEvents(courseId: string | null | undefined): CourseGradingStream {
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useTranslations('Features.Grading.Stream')
  const [live, setLive] = useState(false)
  const [accessLost, setAccessLost] = useState(false)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!courseId || typeof EventSource === 'undefined') return
    const source = new EventSource(courseGradingEventsUrl(courseId), { withCredentials: true })
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['grading'] })
      void queryClient.invalidateQueries({ queryKey: ['file-submission'] })
    }
    source.addEventListener('connected', () => setLive(true))
    source.addEventListener('closed', () => {
      source.close()
      setLive(false)
      setAccessLost(true)
      invalidate()
    })
    for (const name of GRADING_EVENT_NAMES) source.addEventListener(name, invalidate)
    source.onerror = () => setLive(false)
    return () => {
      source.close()
      setLive(false)
    }
  }, [courseId, generation, queryClient])

  // Confirm a `closed`: the stream request itself is the access rule.
  useEffect(() => {
    if (!accessLost || !courseId) return
    toast.warning(t('accessLost'), { id: ACCESS_LOST_TOAST, duration: Infinity })
    const probe = new AbortController()
    const confirm = async () => {
      const response = await fetch(courseGradingEventsUrl(courseId), {
        credentials: 'include',
        signal: probe.signal,
      })
      probe.abort()
      toast.dismiss(ACCESS_LOST_TOAST)
      if (response.ok) {
        setAccessLost(false)
        setGeneration(value => value + 1)
      } else if (response.status === 401) {
        handleBrowserUnauthenticated()
      } else {
        router.replace('/unauthorized')
      }
    }
    // A failed probe (offline, unmounted) leaves the controls disabled.
    confirm().catch(() => undefined)
    return () => probe.abort()
  }, [accessLost, courseId, router, t])

  return { live, accessLost }
}
