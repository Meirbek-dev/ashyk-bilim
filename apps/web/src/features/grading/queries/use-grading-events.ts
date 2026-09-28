'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getAPIUrl } from '@services/config/config'
import { useRouter } from '@/i18n/navigation'
import { handleBrowserUnauthenticated } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import { useApiError } from '@/hooks/useApiError'

/** Named SSE events on `GET courses/{id}/grading/events`. */
export const GRADING_EVENT_NAMES = [
  'submission.submitted',
  'grade.saved',
  'grade.published',
  'submission.returned',
] as const

const ACCESS_LOST_TOAST = 'grading-access-lost'
const ACCESS_LOST_EVENT = 'grading:access-lost'
let mountedStreams = 0

export function courseGradingEventsUrl(courseId: string) {
  return `${getAPIUrl().replace(/\/+$/, '')}/courses/${courseId}/grading/events`
}

/**
 * UX-259: a 403/404 from a grading save (demoted while the page was open —
 * the 404 is the id-secret rule) runs the same access re-check as a `closed`
 * stream instead of a generic toast. Returns `false` when no stream hook is
 * mounted or the error is something else, so the caller toasts as usual.
 */
export function reportGradingAccessLost(error: unknown): boolean {
  if (!isApiError(error) || (error.status !== 403 && error.status !== 404) || mountedStreams === 0) return false
  window.dispatchEvent(new CustomEvent(ACCESS_LOST_EVENT, { detail: error }))
  return true
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
  const { toastApiError } = useApiError()
  const [live, setLive] = useState(false)
  const [accessLost, setAccessLost] = useState(false)
  // The save error behind a UX-259 report: toasted only if the re-check says access is intact.
  const reportedError = useRef<unknown>(null)

  useEffect(() => {
    // A confirmed access loss keeps the stream down; the re-check that clears it re-subscribes.
    if (!courseId || accessLost || typeof EventSource === 'undefined') return
    const source = new EventSource(courseGradingEventsUrl(courseId), { withCredentials: true })
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['grading'] })
      void queryClient.invalidateQueries({ queryKey: ['file-submission'] })
    }
    const lost = () => {
      source.close()
      setLive(false)
      setAccessLost(true)
      invalidate()
    }
    const onReport = (event: Event) => {
      reportedError.current = (event as CustomEvent).detail
      lost()
    }
    source.addEventListener('connected', () => setLive(true))
    source.addEventListener('closed', lost)
    for (const name of GRADING_EVENT_NAMES) source.addEventListener(name, invalidate)
    source.addEventListener('error', () => setLive(false))
    window.addEventListener(ACCESS_LOST_EVENT, onReport)
    mountedStreams += 1
    return () => {
      mountedStreams -= 1
      window.removeEventListener(ACCESS_LOST_EVENT, onReport)
      source.close()
      setLive(false)
    }
  }, [accessLost, courseId, queryClient])

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
        // Access is intact: the save failed for another reason — say that one.
        const error = reportedError.current
        reportedError.current = null
        if (error) toastApiError(error)
        setAccessLost(false)
      } else if (response.status === 401) {
        handleBrowserUnauthenticated()
      } else {
        router.replace('/unauthorized')
      }
    }
    // A failed probe (offline, unmounted) leaves the controls disabled.
    confirm().catch(() => undefined)
    return () => probe.abort()
  }, [accessLost, courseId, router, t, toastApiError])

  return { live, accessLost }
}
