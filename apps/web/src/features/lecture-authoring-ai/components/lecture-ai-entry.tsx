'use client'

import { RefreshCw, WandSparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery } from '@/features/ai-experience'

import { useRunLectureCritique } from '../api/use-lecture-authoring-ai'
import { LectureReviewPanel } from './lecture-review-panel'

export function LectureAIEntry({ activityUuid, courseUuid }: { activityUuid?: string | null; courseUuid: string }) {
  const t = useTranslations('AiExperience.lectureAIEntry')
  const critique = useRunLectureCritique(courseUuid)
  const payload = { ...(activityUuid ? { activity_uuid: activityUuid } : {}), language: 'auto' }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <WandSparkles className="size-4" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={critique.isPending} onClick={() => critique.mutate(payload)}>
            <RefreshCw className="size-4" />
            {t('review')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {critique.error ? (
          <AIErrorRecovery message={critique.error.message} onRetry={() => critique.mutate(payload)} />
        ) : null}
        {critique.data ? (
          <LectureReviewPanel review={critique.data} />
        ) : (
          <p className="text-muted-foreground text-sm">{t('defaultStatus')}</p>
        )}
      </CardContent>
    </Card>
  )
}
