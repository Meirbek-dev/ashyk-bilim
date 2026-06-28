import { CheckCircle2Icon, CircleIcon } from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import { AI_STATE_LABELS } from '../lib/ai-copy'
import { aiStateProgress, buildAIStages } from '../lib/ai-run-state'
import type { AIWorkState } from '../lib/ai-run-state'

interface AIRunTimelineProps {
  state: AIWorkState
  className?: string
}

export function AIRunTimeline({ state, className }: AIRunTimelineProps) {
  const progress = aiStateProgress(state)
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Progress value={progress}>
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-sm font-medium">{AI_STATE_LABELS[state]}</span>
          <span className="text-muted-foreground text-sm tabular-nums">{progress}%</span>
        </div>
      </Progress>
      <ol className="grid gap-2 sm:grid-cols-5">
        {buildAIStages(state, AI_STATE_LABELS).map(stage => (
          <li key={stage.state} className="flex min-w-0 items-center gap-2 text-sm">
            {stage.complete ? (
              <CheckCircle2Icon className="text-primary" aria-hidden="true" />
            ) : (
              <CircleIcon className="text-muted-foreground" aria-hidden="true" />
            )}
            <span className={cn('truncate', stage.complete ? 'text-foreground' : 'text-muted-foreground')}>
              {stage.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
