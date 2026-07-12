import { CheckCircle2Icon, CircleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

import { buildAIStages } from '../lib/ai-run-state'
import type { AIWorkState } from '../lib/ai-run-state'

interface AIRunTimelineProps {
  state: AIWorkState
  className?: string
}

export function AIRunTimeline({ state, className }: AIRunTimelineProps) {
  const t = useTranslations('AiExperience.states.labels')
  const translatedLabels = {
    idle: t('idle'),
    confirming: t('confirming'),
    queued: t('queued'),
    collecting_context: t('collecting_context'),
    running: t('running'),
    checking_evidence: t('checking_evidence'),
    complete: t('complete'),
    needs_human_review: t('needs_human_review'),
    failed: t('failed'),
    cancelled: t('cancelled'),
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-sm font-medium" aria-live="polite">
        {translatedLabels[state]}
      </p>
      <ol className="grid gap-2 sm:grid-cols-5">
        {buildAIStages(state, translatedLabels).map(stage => (
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
