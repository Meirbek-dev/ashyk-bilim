'use client'

import { RefreshCw, WandSparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery, AIRunProgress, useAIRunController } from '@/features/ai-experience'

import { useQueueLectureCritique } from '../api/use-lecture-authoring-ai'
import type { LectureReview } from '../api/use-lecture-authoring-ai'
import { LectureReviewPanel } from './lecture-review-panel'

export function LectureAIEntry({ activityUuid, courseUuid }: { activityUuid?: string | null; courseUuid: string }) {
  const t = useTranslations('AiExperience.lectureAIEntry')
  const payload: { activity_uuid?: string | null; language: string } = {
    ...(activityUuid ? { activity_uuid: activityUuid } : {}),
    language: 'auto',
  }
  const queue = useQueueLectureCritique(courseUuid)
  const critique = useAIRunController<
    { activity_uuid?: string | null; language: string },
    LectureReview['suggestions_json']
  >({
    queue,
  })
  const reviewArtifact = critique.latestArtifact?.content_json

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
          <Button size="sm" variant="outline" disabled={critique.pending} onClick={() => void critique.start(payload)}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {t('review')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AIRunProgress state={critique.state} onCancel={critique.pending ? critique.cancel : undefined} />
        {critique.error ? (
          <AIErrorRecovery message={critique.error.message} onRetry={() => void critique.start(payload)} />
        ) : null}
        {reviewArtifact ? (
          <LectureReviewPanel
            review={{
              review_uuid: critique.latestArtifact?.artifact_uuid ?? 'lecture_review_artifact',
              status: 'needs_human_review',
              language: 'auto',
              suggestions_json: reviewArtifact,
              dismissed_json: {},
            }}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t('defaultStatus')}</p>
        )}
      </CardContent>
    </Card>
  )
}
