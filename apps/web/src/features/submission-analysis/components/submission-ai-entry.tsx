'use client'

import { BrainCircuit, FilePenLine, RefreshCw, Route } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AIArtifactLifecycle,
  AICommandList,
  AIErrorRecovery,
  AIRunProgress,
  useAIRunController,
} from '@/features/ai-experience'
import { RemediationResultShell, useQueueRemediation } from '@/features/remediation'
import type { RemediationSession } from '@/features/remediation'

import {
  latestSubmissionAnalysisQueryOptions,
  useLatestSubmissionAnalysis,
  useQueueSubmissionAnalysis,
} from '../api/use-submission-analysis'
import type { SubmissionAnalysis } from '../api/use-submission-analysis'
import { SubmissionAnalysisResultShell } from './submission-analysis-result-shell'

export function SubmissionAIEntry({
  onDraftFeedback,
  submissionUuid,
}: {
  onDraftFeedback?: (feedback: string) => void
  submissionUuid: string | null
}) {
  const t = useTranslations('AiExperience.submissionAIEntry')
  const latest = useLatestSubmissionAnalysis(submissionUuid ?? '')
  const queueAnalysis = useQueueSubmissionAnalysis(submissionUuid ?? '')
  const run = useAIRunController({
    invalidateQueryKeys: [latestSubmissionAnalysisQueryOptions(submissionUuid ?? '').queryKey],
    persistenceKey: `submission-analysis:${submissionUuid ?? 'none'}`,
    queue: queueAnalysis,
  })
  const queueRemediation = useQueueRemediation(submissionUuid ?? '')
  const remediation = useAIRunController<{ gate_mode: boolean; language: string }, RemediationSession['lecture_json']>({
    persistenceKey: `submission-remediation:${submissionUuid ?? 'none'}`,
    queue: queueRemediation,
  })
  const remediationArtifact = remediation.latestArtifact?.content_json

  const remediationSession = remediationArtifact
    ? {
        session_uuid: remediation.latestArtifact?.artifact_uuid ?? 'remediation_artifact',
        status: 'active' as const,
        gate_mode: true,
        lecture_json: remediationArtifact,
        test_json: { questions: [] },
      }
    : null

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
        <AICommandList surface="submission" disabled={run.pending} onCommand={() => void run.start('auto')} />
        <AIArtifactLifecycle state={run.state} artifact={run.latestArtifact} />
        <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
        {run.error ? <AIErrorRecovery message={run.error.message} onRetry={() => void run.start('auto')} /> : null}
        {latest.data ? <SubmissionAnalysisResultShell analysis={latest.data} /> : null}
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
          onClick={() => void remediation.start({ gate_mode: true, language: 'auto' })}
        >
          <Route data-icon="inline-start" aria-hidden="true" />
          {t('generateGate')}
        </Button>
        <AIRunProgress state={remediation.state} onCancel={remediation.pending ? remediation.cancel : undefined} />
        {remediationSession ? <RemediationResultShell session={remediationSession} /> : null}
        {remediation.error ? <AIErrorRecovery message={remediation.error.message} /> : null}
      </CardContent>
    </Card>
  )
}

function buildFeedbackDraft(analysis: SubmissionAnalysis) {
  const lines = analysis.analysis_json.knowledge_gaps?.map(gap => `- **${gap.concept}**: ${gap.remediation_goal}`)
  return [analysis.analysis_json.summary, lines?.length ? lines.join('\n') : null].filter(Boolean).join('\n\n')
}
