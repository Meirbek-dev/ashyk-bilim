'use client'

import { ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { StudentAiSafetyState } from '../types'

export function StudentAiSafetyBoundary({ safety }: { safety: StudentAiSafetyState }) {
  const Icon = safety.level === 'permitted' ? ShieldCheckIcon : TriangleAlertIcon

  return (
    <Alert variant={safety.level === 'blocked' ? 'destructive' : 'default'} aria-live="polite">
      <Icon aria-hidden="true" />
      <AlertTitle>{safety.title}</AlertTitle>
      <AlertDescription>{safety.description}</AlertDescription>
    </Alert>
  )
}
