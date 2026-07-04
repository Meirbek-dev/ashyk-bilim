'use client'

import { BotIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { useActivityAIUrlState } from './activity-ai-url-state'
import { useAIScopeCapabilities } from './use-ai-scope-capabilities'
import type { AIScope } from './use-ai-scope-capabilities'

export function ActivityAITrigger({ scope }: { scope: AIScope }) {
  const t = useTranslations('Activities.AiAssistantPanel')
  const { setOpen } = useActivityAIUrlState(scope.surface === 'student-activity' ? 'ask' : 'review')
  const capabilities = useAIScopeCapabilities(scope)
  const available = capabilities.data?.available ?? true
  const disabled = capabilities.isLoading || !available
  const label = t('title')
  const reason = capabilities.data?.reason

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={label}
            onClick={() => setOpen(true)}
          />
        }
      >
        <BotIcon data-icon="inline-start" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{disabled && reason ? t('unavailable') : label}</TooltipContent>
    </Tooltip>
  )
}
