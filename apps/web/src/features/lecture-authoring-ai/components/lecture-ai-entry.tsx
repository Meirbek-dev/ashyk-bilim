'use client'

import { RefreshCw, WandSparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery } from '@/features/ai-experience'

import { useRunLectureCritique } from '../api/use-lecture-authoring-ai'
import { LectureReviewPanel } from './lecture-review-panel'

export function LectureAIEntry({ activityUuid, courseUuid }: { activityUuid?: string | null; courseUuid: string }) {
  const critique = useRunLectureCritique(courseUuid)
  const payload = { ...(activityUuid ? { activity_uuid: activityUuid } : {}), language: 'auto' }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <WandSparkles className="size-4" />
              AI lecture review
            </CardTitle>
            <CardDescription>
              Find unclear explanations, missing examples, and weak assessment alignment.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={critique.isPending} onClick={() => critique.mutate(payload)}>
            <RefreshCw className="size-4" />
            Review
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
          <p className="text-muted-foreground text-sm">
            Run a review after saving the lecture draft. Suggestions stay in human-review state.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
