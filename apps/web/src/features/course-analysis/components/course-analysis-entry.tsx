'use client'

import { BrainCircuit, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  AIArtifactLifecycle,
  AIErrorRecovery,
  AIPrivacyNotice,
  AIRunProgress,
  useAIRunController,
} from '@/features/ai-experience'

import {
  latestCourseAnalysisQueryOptions,
  useLatestCourseAnalysis,
  usePublishCourseAnalysis,
  useQueueCourseAnalysis,
} from '../api/use-course-analysis'
import { CourseAnalysisResultShell } from './course-analysis-result-shell'

export function CourseAnalysisEntry({ courseUuid }: { courseUuid: string }) {
  const t = useTranslations('AiExperience.courseAnalysisEntry')
  const latest = useLatestCourseAnalysis(courseUuid)
  const queue = useQueueCourseAnalysis(courseUuid)
  const run = useAIRunController({
    invalidateQueryKeys: [latestCourseAnalysisQueryOptions(courseUuid).queryKey],
    persistenceKey: `course-analysis:${courseUuid}`,
    queue,
  })
  const publish = usePublishCourseAnalysis(courseUuid)
  const analysis = latest.data ?? null

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-medium">
            <BrainCircuit data-icon="inline-start" aria-hidden="true" />
            <span className="truncate">{t('title')}</span>
          </h2>
          <p className="text-muted-foreground text-sm leading-normal">{t('description')}</p>
        </div>
        <Button size="sm" variant="outline" disabled={run.pending} onClick={() => void run.start('auto')}>
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          {latest.data ? t('rerun') : t('analyze')}
        </Button>
      </div>
      <AIPrivacyNotice aiRole="teacher" />
      <AIArtifactLifecycle state={run.state} artifact={run.latestArtifact} />
      <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
      {run.error ? <AIErrorRecovery message={run.error.message} onRetry={() => void run.start('auto')} /> : null}
      {analysis ? (
        <CourseAnalysisResultShell
          analysis={analysis}
          courseUuid={courseUuid}
          publishing={publish.isPending}
          onPublish={() => publish.mutate(analysis.analysis_uuid)}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t('defaultStatus')}</p>
      )}
    </section>
  )
}
