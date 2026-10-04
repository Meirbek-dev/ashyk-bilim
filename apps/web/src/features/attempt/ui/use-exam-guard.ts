import { useDebouncer } from '@tanstack/react-pacer'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react'

import type { Policy, StudentSubmission, ViolationState } from '#/shared/api/gen/types.gen'

import { protections } from '../model/attempt'
import { submissionOptions, violationOptions } from '../queries'

function onFullscreenChange(change: () => void) {
  document.addEventListener('fullscreenchange', change)
  return () => document.removeEventListener('fullscreenchange', change)
}

// A browser without full screen (or one that refuses) leaves the notice up; the server still decides.
const enterFullscreen = () => void document.documentElement.requestFullscreen().catch(() => null)

/** A blur shorter than this (a permission prompt, a click into a frame) is not a tab switch. */
const BLUR_GRACE_MS = 500

/**
 * Exam protection as a client measure (spec 7.12, B-ATT-21): leaving the tab, copy / cut / paste and leaving full
 * screen are reported to the server, which counts them and decides; copying and the context menu are blocked when
 * the policy says so. The server's count goes into the cached attempt; `exceeded` means a hand-in now scores 0.
 */
export function useExamGuard(policy: Policy, attempt: StudentSubmission) {
  const queryClient = useQueryClient()
  const report = useMutation(violationOptions())
  const [state, setState] = useState<ViolationState | null>(null)
  const fullscreen = useSyncExternalStore(
    onFullscreenChange,
    () => Boolean(document.fullscreenElement),
    () => true,
  )
  const on = protections(policy)
  const send = (kind: string) =>
    report.mutate(
      { path: { submission_id: attempt.id }, body: { kind } },
      {
        onSuccess: fresh => {
          setState(fresh)
          queryClient.setQueryData(submissionOptions(attempt.id).queryKey, old =>
            old ? { ...old, violation_count: fresh.violation_count } : old,
          )
        },
      },
    )
  const away = useDebouncer(
    () => {
      if (document.hidden || !document.hasFocus()) send('tab_switch')
    },
    { wait: BLUR_GRACE_MS },
  )

  // The listeners live as long as the rules; what they do always sees this render.
  const violation = useEffectEvent((kind: string) => send(kind))
  const left = useEffectEvent(() => away.maybeExecute())
  const rules = on.join(' ')
  useEffect(() => {
    const controller = new AbortController()
    const listen = (target: EventTarget, type: string, handler: (event: Event) => void) =>
      target.addEventListener(type, handler, { signal: controller.signal })
    if (rules.includes('tab_switch')) {
      listen(document, 'visibilitychange', left)
      listen(window, 'blur', left)
    }
    if (rules.includes('copy_paste'))
      for (const type of ['copy', 'cut', 'paste'])
        listen(document, type, event => {
          event.preventDefault()
          violation('copy_paste')
        })
    if (rules.includes('right_click')) listen(document, 'contextmenu', event => event.preventDefault())
    if (rules.includes('fullscreen'))
      listen(document, 'fullscreenchange', () => {
        if (!document.fullscreenElement) violation('fullscreen_exit')
      })
    return () => controller.abort()
  }, [rules])

  return {
    active: on.length > 0,
    count: state?.violation_count ?? attempt.violation_count,
    threshold: state?.threshold ?? policy.violation_threshold,
    exceeded: state?.exceeded ?? false,
    needsFullscreen: on.includes('fullscreen') && !fullscreen,
    enterFullscreen,
  }
}
