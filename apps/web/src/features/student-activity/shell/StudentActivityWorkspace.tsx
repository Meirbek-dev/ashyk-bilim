'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Activity } from '@components/Contexts/CourseContext'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext'
import { cn } from '@/lib/utils'
import ActivityHeader from './ActivityHeader'
import OutlineRail from './OutlineRail'
import BottomActionBar from './BottomActionBar'
import InlineStatusStrip from './InlineStatusStrip'
import LockStateCard from './LockStateCard'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import { CourseAIHub } from '@/features/course-qa'

const CONTENT_READ_TOLERANCE_PX = 24

interface StudentActivityWorkspaceProps {
  activity: Activity | null
  children: React.ReactNode
  courseUuid: string
  runtime: StudentActivityRuntime
}

export default function StudentActivityWorkspace({
  activity: _activity,
  children,
  courseUuid,
  runtime,
}: StudentActivityWorkspaceProps) {
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const { mode } = useActivityLayout()
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT'
  const focusModeActive = focusMode && !isAttemptActive
  const activityType = runtime.activity?.type ?? ''
  const activityUuid = runtime.activity?.uuid ?? 'course-end'
  const shouldRequireContentRead =
    runtime.primary_action.id === 'mark_complete' &&
    runtime.primary_action.enabled &&
    !runtime.progress.complete &&
    isReadingActivityType(activityType)
  const contentReadComplete = useContentReadCompletion({
    enabled: shouldRequireContentRead,
    targetId: 'activity-main-content',
    resetKey: activityUuid,
  })

  const contentFrameClassName = useMemo(() => {
    switch (activityType) {
      case 'TYPE_DYNAMIC': {
        return 'mx-auto w-full max-w-[112rem]'
      }
      case 'TYPE_VIDEO':
      case 'TYPE_DOCUMENT':
      case 'TYPE_CODE_CHALLENGE': {
        return 'mx-auto w-full max-w-[112rem]'
      }
      case 'TYPE_FILE_SUBMISSION': {
        return 'mx-auto w-full max-w-[80rem]'
      }
      case 'TYPE_EXAM':
      case 'TYPE_CUSTOM': {
        return 'mx-auto w-full max-w-[96rem]'
      }
      default: {
        return 'mx-auto w-full max-w-[86rem]'
      }
    }
  }, [activityType])

  const toggleFocusMode = useCallback(() => {
    if (!focusMode) {
      setOutlineOpen(false)
    }
    setFocusMode(value => !value)
  }, [focusMode])

  useEffect(() => {
    if (focusModeActive) {
      document.documentElement.dataset.activityFocus = 'true'
      return () => {
        delete document.documentElement.dataset.activityFocus
      }
    }

    delete document.documentElement.dataset.activityFocus
    return undefined
  }, [focusModeActive])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (outlineOpen) {
        setOutlineOpen(false)
        return
      }

      if (focusModeActive) setFocusMode(false)
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [focusModeActive, outlineOpen])

  useEffect(() => {
    if (isAttemptActive) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'o' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !focusModeActive &&
        !isTypingTarget(event.target)
      ) {
        setOutlineOpen(value => !value)
      }

      if (
        event.key.toLowerCase() === 'f' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        toggleFocusMode()
      }
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [focusModeActive, isAttemptActive, toggleFocusMode])

  const isLocked = runtime.progress.state === 'locked' || runtime.progress.state === 'unavailable'

  return (
    <div
      data-focus={focusModeActive ? 'true' : undefined}
      className={cn(
        'bg-background text-foreground flex flex-col',
        focusModeActive ? 'min-h-dvh' : 'min-h-[calc(100dvh-3.5rem)]',
      )}
    >
      {!isAttemptActive && !focusModeActive ? (
        <OutlineRail runtime={runtime} open={outlineOpen} onClose={() => setOutlineOpen(false)} />
      ) : null}

      {!isAttemptActive ? (
        <ActivityHeader
          runtime={runtime}
          focusMode={focusModeActive}
          onToggleFocusMode={toggleFocusMode}
          onToggleOutline={() => setOutlineOpen(value => !value)}
          outlineOpen={outlineOpen}
        />
      ) : null}

      <div className="relative flex flex-1">
        <main
          id="activity-main-content"
          className={cn(
            'min-w-0 flex-1 px-4 sm:px-6 lg:px-8',
            contentFrameClassName,
            focusModeActive ? 'pb-10 pt-6' : 'pb-24 pt-4',
          )}
        >
          {!isAttemptActive && !isLocked && !focusModeActive ? <InlineStatusStrip runtime={runtime} /> : null}

          {isLocked ? <LockStateCard runtime={runtime} /> : children}
          {!isAttemptActive && !isLocked && !focusModeActive ? (
            <div className="mt-8">
              <CourseAIHub courseUuid={courseUuid} />
            </div>
          ) : null}
        </main>
      </div>

      <BottomActionBar
        courseUuid={courseUuid}
        contentReadComplete={!shouldRequireContentRead || contentReadComplete}
        focusMode={focusModeActive}
        runtime={runtime}
      />

      <KeyboardShortcutsModal />
    </div>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

function isReadingActivityType(activityType: string) {
  return activityType === 'TYPE_DYNAMIC'
}

function useContentReadCompletion({
  enabled,
  resetKey,
  targetId,
}: {
  enabled: boolean
  resetKey: string
  targetId: string
}) {
  const [complete, setComplete] = useState(!enabled)
  const completeRef = useRef(!enabled)

  const setCompleteOnce = useCallback((nextComplete: boolean) => {
    if (completeRef.current === nextComplete) return
    completeRef.current = nextComplete
    setComplete(nextComplete)
  }, [])

  const [prevResetKey, setPrevResetKey] = useState<string>(resetKey)
  const [prevEnabled, setPrevEnabled] = useState<boolean>(enabled)

  if (resetKey !== prevResetKey || enabled !== prevEnabled) {
    setPrevResetKey(resetKey)
    setPrevEnabled(enabled)
    setComplete(!enabled)
  }

  useEffect(() => {
    completeRef.current = !enabled
  }, [enabled, resetKey])

  useEffect(() => {
    if (!enabled) return

    const target = document.getElementById(targetId)
    if (!target) {
      setCompleteOnce(true)
      return
    }

    let frame = 0
    const checkReadCompletion = () => {
      frame = 0
      const { bottom } = target.getBoundingClientRect()
      const viewportBottom = window.innerHeight
      setCompleteOnce(bottom <= viewportBottom + CONTENT_READ_TOLERANCE_PX)
    }
    const scheduleCheck = () => {
      if (frame) return
      frame = globalThis.requestAnimationFrame(checkReadCompletion)
    }

    scheduleCheck()
    window.addEventListener('scroll', scheduleCheck, { passive: true })
    window.addEventListener('resize', scheduleCheck)

    const resizeObserver = new ResizeObserver(scheduleCheck)
    resizeObserver.observe(target)

    return () => {
      if (frame) globalThis.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleCheck)
      window.removeEventListener('resize', scheduleCheck)
      resizeObserver.disconnect()
    }
  }, [enabled, resetKey, setCompleteOnce, targetId])

  return complete
}
