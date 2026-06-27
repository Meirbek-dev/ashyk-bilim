'use client'

import { Loader2Icon, RadioTowerIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import type { StudentAiRunState } from '../types'

const PROGRESS_LABEL = 'AI response progress'

const progressByState: Record<StudentAiRunState, number> = {
  idle: 0,
  preparing: 32,
  streaming: 72,
  complete: 100,
  failed: 100,
  cancelled: 100,
}

export function StudentAiRunStatus({
  runState,
  statusMessage,
  onStop,
}: {
  runState: StudentAiRunState
  statusMessage: string | null
  onStop: () => void
}) {
  const isActive = runState === 'preparing' || runState === 'streaming'
  const label = isActive ? (statusMessage ?? 'AI is working') : runState === 'complete' ? 'Ready' : 'Waiting'

  return (
    <section className="flex flex-col gap-2" aria-label="AI run status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {isActive ? (
            <Loader2Icon aria-hidden="true" className="text-primary size-4 animate-spin" />
          ) : (
            <RadioTowerIcon aria-hidden="true" className="text-muted-foreground size-4" />
          )}
          <span className="truncate">{label}</span>
        </div>
        {isActive ? (
          <Button type="button" variant="outline" size="sm" onClick={onStop}>
            <SquareIcon data-icon="inline-start" />
            Stop
          </Button>
        ) : null}
      </div>
      <Progress value={progressByState[runState]}>
        <ProgressLabel className="sr-only">{PROGRESS_LABEL}</ProgressLabel>
        <ProgressValue className="sr-only" />
      </Progress>
    </section>
  )
}
