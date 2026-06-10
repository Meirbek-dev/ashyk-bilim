'use client'

import type { CourseDirtySection } from '@/stores/courses/courseEditorStore'
import { useSyncDirtySection } from '@/hooks/useSyncDirtySection'
import { useEffect, useRef, useState } from 'react'

interface UseCourseSectionDraftOptions<TValue> {
  section: CourseDirtySection
  serverValue: TValue
  isEqual?: (draft: TValue, serverValue: TValue) => boolean
}

const defaultIsEqual = <TValue>(draft: TValue, serverValue: TValue) => Object.is(draft, serverValue)

export function useCourseSectionDraft<TValue>({
  section,
  serverValue,
  isEqual = defaultIsEqual,
}: UseCourseSectionDraftOptions<TValue>) {
  const [baseValue, setBaseValue] = useState(serverValue)
  const [draft, setDraft] = useState(serverValue)
  const isDirty = !isEqual(draft, baseValue)
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useSyncDirtySection(section, isDirty)

  useEffect(() => {
    if (!isDirtyRef.current) {
      setBaseValue(serverValue)
      setDraft(serverValue)
    }
  }, [serverValue])

  const discard = () => {
    setDraft(baseValue)
  }

  const markClean = (nextValue = draft) => {
    setBaseValue(nextValue)
    setDraft(nextValue)
  }

  return {
    draft,
    setDraft,
    isDirty,
    discard,
    markClean,
  }
}
