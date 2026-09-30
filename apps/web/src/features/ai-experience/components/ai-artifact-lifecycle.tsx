import { CheckCircle2, CircleDashed, Clock3, FileClock, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { AIArtifactPayload } from '../workspace/use-ai-run-controller'
import type { AIWorkState } from '../lib/ai-run-state'

export function AIArtifactLifecycle({
  artifact,
  className,
  state,
}: {
  artifact?: Pick<AIArtifactPayload, 'final'> | null | undefined
  className?: string | undefined
  state: AIWorkState
}) {
  const t = useTranslations('AiExperience.artifactLifecycle')
  const steps = [
    {
      complete: state !== 'idle' && state !== 'confirming',
      icon: Clock3,
      label: t('queued'),
    },
    {
      complete: ['checking_evidence', 'needs_human_review', 'complete'].includes(state),
      icon: ShieldCheck,
      label: t('evidenceChecked'),
    },
    {
      complete: Boolean(artifact),
      icon: FileClock,
      label: artifact?.final ? t('finalArtifact') : t('draftArtifact'),
    },
    {
      complete: state === 'complete',
      icon: CheckCircle2,
      label: t('ready'),
    },
  ]

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {steps.map(step => {
        const Icon = step.complete ? step.icon : CircleDashed
        return (
          <Badge key={step.label} variant={step.complete ? 'secondary' : 'outline'}>
            <Icon data-icon="inline-start" aria-hidden="true" />
            {step.label}
          </Badge>
        )
      })}
    </div>
  )
}
