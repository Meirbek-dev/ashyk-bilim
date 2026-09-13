'use client'

import { useMemo } from 'react'
import { aiLanguageFor } from '@/i18n/config'
import { BrainCircuit, FilePenLine, RefreshCw, Route } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AIArtifactLifecycle,
  AIEmptyState,
  AIErrorRecovery,
  AIRunProgress,
  useAIRunController,
} from '@/features/ai-experience'
import { RemediationLecture, RemediationResultShell, useQueueRemediation } from '@/features/remediation'
import type { RemediationView } from '@/features/remediation'

import {
  latestSubmissionAnalysisQueryOptions,
  useLatestSubmissionAnalysis,
  useQueueSubmissionAnalysis,
} from '../api/use-submission-analysis'
import type { SubmissionAnalysisView } from '../api/use-submission-analysis'
import { SubmissionAnalysisResultShell } from './submission-analysis-result-shell'

export function SubmissionAIEntry({
  onDraftFeedback,
  submissionUuid,
}: {
  onDraftFeedback?: (feedback: string) => void
  submissionUuid: string | null
}) {
  const t = useTranslations('AiExperience.submissionAIEntry')
  const locale = useLocale()
  const latest = useLatestSubmissionAnalysis(submissionUuid ?? '')
  const queueAnalysis = useQueueSubmissionAnalysis(submissionUuid ?? '')
  const run = useAIRunController({
    invalidateQueryKeys: [latestSubmissionAnalysisQueryOptions(submissionUuid ?? '').queryKey],
    persistenceKey: `submission-analysis:${submissionUuid ?? 'none'}`,
    queue: queueAnalysis,
  })
  const queueRemediation = useQueueRemediation(submissionUuid ?? '')
  const remediation = useAIRunController({
    persistenceKey: `submission-remediation:${submissionUuid ?? 'none'}`,
    queue: queueRemediation,
  })
  const artifactContent = remediation.latestArtifact?.content
  // The queued run's final artifact is the lecture bundle; the session row itself is not returned.
  const remediationSession = useMemo<RemediationView | null>(() => {
    const lecture = RemediationLecture.safeParse(artifactContent)
    return lecture.success ? { gate_mode: true, lecture: lecture.data, status: 'assigned' } : null
  }, [artifactContent])

  if (!submissionUuid) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="size-4" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={run.pending} onClick={() => void run.start('auto')}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {t('analyze')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AIArtifactLifecycle state={run.state} artifact={run.latestArtifact} />
        <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
        {run.error ? <AIErrorRecovery error={run.error} onRetry={() => void run.start('auto')} /> : null}
        {latest.data ? (
          <SubmissionAnalysisResultShell analysis={latest.data} />
        ) : latest.error ? (
          <AIErrorRecovery error={latest.error} onRetry={() => void latest.refetch()} />
        ) : (
          <AIEmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        )}
        {latest.data && onDraftFeedback ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (latest.data) onDraftFeedback(buildFeedbackDraft(latest.data))
            }}
          >
            <FilePenLine data-icon="inline-start" aria-hidden="true" />
            {t('draftFeedback')}
          </Button>
        ) : null}
        <Button
          className="w-full"
          variant="secondary"
          disabled={remediation.pending || !latest.data}
          onClick={() => void remediation.start({ gate_mode: true, language: aiLanguageFor(locale) })}
        >
          <Route data-icon="inline-start" aria-hidden="true" />
          {t('generateGate')}
        </Button>
        <AIRunProgress state={remediation.state} onCancel={remediation.pending ? remediation.cancel : undefined} />
        {remediationSession ? <RemediationResultShell session={remediationSession} /> : null}
        {remediation.error ? <AIErrorRecovery error={remediation.error} /> : null}
      </CardContent>
    </Card>
  )
}

/** Summary + one bullet per knowledge gap, ready to paste into the feedback box. */
function buildFeedbackDraft(analysis: SubmissionAnalysisView) {
  const lines = analysis.analysis.knowledge_gaps?.map(gap => `- **${gap.concept}**: ${gap.remediation_goal}`)
  return [analysis.analysis.summary, lines?.length ? lines.join('\n') : null].filter(Boolean).join('\n\n')
}
