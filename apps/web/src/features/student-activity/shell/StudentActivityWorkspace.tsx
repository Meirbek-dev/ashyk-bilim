'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Activity } from '@components/Contexts/CourseContext'
import AiAssistantPanel from '@/features/ai-assistant/AiAssistantPanel'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext'
import { cn } from '@/lib/utils'
import ActivityHeader from './ActivityHeader'
import OutlineRail from './OutlineRail'
import BottomActionBar from './BottomActionBar'
import InlineStatusStrip from './InlineStatusStrip'
import LockStateCard from './LockStateCard'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'

const CONTENT_READ_TOLERANCE_PX = 24

interface StudentActivityWorkspaceProps {
  activity: Activity | null
  children: React.ReactNode
  courseUuid: string
  onAskAi?: React.ReactNode
  runtime: StudentActivityRuntime
}

export default function StudentActivityWorkspace({
  activity: _activity,
  children,
  courseUuid,
  runtime,
}: StudentActivityWorkspaceProps) {
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const { mode } = useActivityLayout()
  const isAttemptActive = mode === 'ACTIVE_ATTEMPT'
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

  useEffect(() => {
    if (focusMode && isAttemptActive) {
      setFocusMode(false)
    }
  }, [focusMode, isAttemptActive])

  useEffect(() => {
    if (focusMode) {
      document.documentElement.dataset.activityFocus = 'true'
      return () => {
        delete document.documentElement.dataset.activityFocus
      }
    }

    delete document.documentElement.dataset.activityFocus
    return undefined
  }, [focusMode])

  useEffect(() => {
    if (!focusMode) return
    setAiOpen(false)
    setOutlineOpen(false)
  }, [focusMode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (aiOpen) {
        setAiOpen(false)
        return
      }

      if (outlineOpen) {
        setOutlineOpen(false)
        return
      }

      if (focusMode) setFocusMode(false)
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [focusMode, aiOpen, outlineOpen])

  useEffect(() => {
    if (isAttemptActive) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'o' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !focusMode &&
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
        setFocusMode(value => !value)
      }
    }

    globalThis.addEventListener('keydown', onKeyDown)
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [focusMode, isAttemptActive])

  const isLocked = runtime.progress.state === 'locked' || runtime.progress.state === 'unavailable'

  return (
    <div
      data-focus={focusMode ? 'true' : undefined}
      className={cn(
        'bg-background text-foreground flex flex-col',
        focusMode ? 'min-h-dvh' : 'min-h-[calc(100dvh-3.5rem)]',
      )}
    >
      {!isAttemptActive && !focusMode ? (
        <OutlineRail runtime={runtime} open={outlineOpen} onClose={() => setOutlineOpen(false)} />
      ) : null}

      <AiAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} runtime={runtime} />

      {!isAttemptActive ? (
        <ActivityHeader
          runtime={runtime}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode(value => !value)}
          onToggleOutline={() => setOutlineOpen(value => !value)}
          outlineOpen={outlineOpen}
          onToggleAi={() => setAiOpen(value => !value)}
          aiOpen={aiOpen}
        />
      ) : null}

      <div className="relative flex flex-1">
        <main
          id="activity-main-content"
          className={cn(
            'min-w-0 flex-1 px-4 sm:px-6 lg:px-8',
            contentFrameClassName,
            focusMode ? 'pb-10 pt-6' : 'pb-24 pt-4',
          )}
        >
          {!isAttemptActive && !isLocked && !focusMode ? <InlineStatusStrip runtime={runtime} /> : null}

          {isLocked ? <LockStateCard runtime={runtime} /> : children}
        </main>
      </div>

      <BottomActionBar
        courseUuid={courseUuid}
        contentReadComplete={!shouldRequireContentRead || contentReadComplete}
        focusMode={focusMode}
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

  useEffect(() => {
    completeRef.current = !enabled
    setComplete(!enabled)
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
