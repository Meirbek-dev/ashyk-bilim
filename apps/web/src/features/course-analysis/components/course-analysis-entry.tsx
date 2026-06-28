'use client'

import { BrainCircuit, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery, AIPrivacyNotice } from '@/features/ai-experience'

import { useLatestCourseAnalysis, usePublishCourseAnalysis, useRunCourseAnalysis } from '../api/use-course-analysis'
import { CourseAnalysisResultShell } from './course-analysis-result-shell'

export function CourseAnalysisEntry({ courseUuid }: { courseUuid: string }) {
  const latest = useLatestCourseAnalysis(courseUuid)
  const run = useRunCourseAnalysis(courseUuid)
  const publish = usePublishCourseAnalysis(courseUuid)
  const analysis = latest.data ?? null

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="size-4" />
              Course AI review
            </CardTitle>
            <CardDescription>Quality score, evidence, and remediation risks for this course.</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate('auto')}>
            <RefreshCw className="size-4" />
            {latest.data ? 'Rerun' : 'Analyze'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AIPrivacyNotice role="teacher" />
        {run.error ? <AIErrorRecovery message={run.error.message} onRetry={() => run.mutate('auto')} /> : null}
        {analysis ? (
          <CourseAnalysisResultShell
            analysis={analysis}
            publishing={publish.isPending}
            onPublish={() => publish.mutate(analysis.analysis_uuid)}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Run an analysis to prepare a teacher-reviewed quality report before publishing AI-visible guidance.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
