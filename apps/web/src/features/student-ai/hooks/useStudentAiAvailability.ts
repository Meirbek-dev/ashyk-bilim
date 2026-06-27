'use client'

import { useMemo } from 'react'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import { resolveStudentAiAvailability } from '../api/student-ai-policy'

export function useStudentAiAvailability({
  hasActivity,
  isAttemptActive,
  runtime,
}: {
  hasActivity: boolean
  isAttemptActive: boolean
  runtime: StudentActivityRuntime
}) {
  return useMemo(
    () => resolveStudentAiAvailability({ hasActivity, isAttemptActive, runtime }),
    [hasActivity, isAttemptActive, runtime],
  )
}
