'use client'

import { MessageSquareTextIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { activityPromptIntents } from '../intents/activity-intents'

export interface AiEmptyStateProps {
  onPrompt: (message: string, intent?: string) => void
}

export function AiEmptyState({ onPrompt }: AiEmptyStateProps) {
  const t = useTranslations('Activities.AiAssistantPanel')
  return (
    <Empty className="min-h-0 flex-1 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquareTextIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t('emptyStateTitle')}</EmptyTitle>
        <EmptyDescription>{t('emptyStateDescription')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          {activityPromptIntents.map(intent => (
            <Button
              key={intent.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPrompt(intent.prompt, intent.id)}
            >
              {intent.label}
            </Button>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  )
}
