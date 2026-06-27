'use client'

import { useEffect, useState } from 'react'
import type { StudentAiSelection } from '../types'

const ACTIVITY_CONTENT_ID = 'activity-main-content'
const EMPTY_SELECTION: StudentAiSelection = { text: '', source: 'activity' }

export function useStudentAiSelection(enabled: boolean): StudentAiSelection {
  const [selection, setSelection] = useState<StudentAiSelection>(EMPTY_SELECTION)

  useEffect(() => {
    if (!enabled) return

    const readSelection = () => {
      const activeSelection = globalThis.getSelection()
      const text = activeSelection?.toString().trim() ?? ''
      const anchorNode = activeSelection?.anchorNode
      const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
      const activityRoot = document.getElementById(ACTIVITY_CONTENT_ID)
      const isInsideActivity = Boolean(anchorElement && activityRoot?.contains(anchorElement))

      setSelection(previous => {
        const next: StudentAiSelection =
          text && isInsideActivity ? { text: text.slice(0, 1200), source: 'selection' } : EMPTY_SELECTION
        return previous.text === next.text && previous.source === next.source ? previous : next
      })
    }

    document.addEventListener('selectionchange', readSelection)
    globalThis.addEventListener('keyup', readSelection)
    globalThis.addEventListener('mouseup', readSelection)
    readSelection()

    return () => {
      document.removeEventListener('selectionchange', readSelection)
      globalThis.removeEventListener('keyup', readSelection)
      globalThis.removeEventListener('mouseup', readSelection)
    }
  }, [enabled])

  return enabled ? selection : EMPTY_SELECTION
}
