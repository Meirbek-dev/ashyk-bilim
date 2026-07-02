'use client'

import { BrainCircuit, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery, AIPrivacyNotice } from '@/features/ai-experience'

import { useLatestCourseAnalysis, usePublishCourseAnalysis, useRunCourseAnalysis } from '../api/use-course-analysis'
import { CourseAnalysisResultShell } from './course-analysis-result-shell'

export function CourseAnalysisEntry({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.courseAnalysisEntry')
  const latest = useLatestCourseAnalysis(courseUuid)
  const run = useRunCourseAnalysis(courseUuid)
  const publish = usePublishCourseAnalysis(courseUuid)
  const analysis = latest.data ?? null

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit data-icon="inline-start" aria-hidden="true" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate('auto')}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {latest.data ? t('rerun') : t('analyze')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AIPrivacyNotice aiRole="teacher" />
        {run.error ? <AIErrorRecovery message={run.error.message} onRetry={() => run.mutate('auto')} /> : null}
        {analysis ? (
          <CourseAnalysisResultShell
            analysis={analysis}
            publishing={publish.isPending}
            onPublish={() => publish.mutate(analysis.analysis_uuid)}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t('defaultStatus')}</p>
        )}
      </CardContent>
    </Card>
  )
}
