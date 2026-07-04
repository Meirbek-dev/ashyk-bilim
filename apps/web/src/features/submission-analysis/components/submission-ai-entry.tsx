'use client'

import { BrainCircuit, RefreshCw, Route } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery, AIRunProgress, useAIRunController } from '@/features/ai-experience'
import { RemediationResultShell, useQueueRemediation } from '@/features/remediation'
import type { RemediationSession } from '@/features/remediation'

import {
  latestSubmissionAnalysisQueryOptions,
  useLatestSubmissionAnalysis,
  useQueueSubmissionAnalysis,
} from '../api/use-submission-analysis'
import { SubmissionAnalysisResultShell } from './submission-analysis-result-shell'

export function SubmissionAIEntry({ submissionUuid }: { submissionUuid: string | null }) {
  const t = useTranslations('AiExperience.submissionAIEntry')
  const latest = useLatestSubmissionAnalysis(submissionUuid ?? '')
  const queueAnalysis = useQueueSubmissionAnalysis(submissionUuid ?? '')
  const run = useAIRunController({
    invalidateQueryKeys: [latestSubmissionAnalysisQueryOptions(submissionUuid ?? '').queryKey],
    queue: queueAnalysis,
  })
  const queueRemediation = useQueueRemediation(submissionUuid ?? '')
  const remediation = useAIRunController<{ gate_mode: boolean; language: string }, RemediationSession['lecture_json']>({
    queue: queueRemediation,
  })
  const remediationArtifact = remediation.latestArtifact?.content_json

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
        <AIRunProgress state={run.state} onCancel={run.pending ? run.cancel : undefined} />
        {run.error ? <AIErrorRecovery message={run.error.message} onRetry={() => void run.start('auto')} /> : null}
        {latest.data ? <SubmissionAnalysisResultShell analysis={latest.data} /> : null}
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
        {remediationArtifact ? (
          <RemediationResultShell
            session={{
              session_uuid: remediation.latestArtifact?.artifact_uuid ?? 'remediation_artifact',
              status: 'active',
              gate_mode: true,
              lecture_json: remediationArtifact,
              test_json: { questions: [] },
            }}
          />
        ) : null}
        {remediation.error ? <AIErrorRecovery message={remediation.error.message} /> : null}
      </CardContent>
    </Card>
  )
}
