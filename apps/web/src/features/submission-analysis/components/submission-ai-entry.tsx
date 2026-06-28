'use client'

import { BrainCircuit, RefreshCw, Route } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIErrorRecovery } from '@/features/ai-experience'
import { RemediationResultShell, useGenerateRemediation } from '@/features/remediation'

import { useLatestSubmissionAnalysis, useRunSubmissionAnalysis } from '../api/use-submission-analysis'
import { SubmissionAnalysisResultShell } from './submission-analysis-result-shell'

export function SubmissionAIEntry({ submissionUuid }: { submissionUuid: string | null }) {
  const latest = useLatestSubmissionAnalysis(submissionUuid ?? '')
  const run = useRunSubmissionAnalysis(submissionUuid ?? '')
  const remediation = useGenerateRemediation(submissionUuid ?? '')

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
              AI submission insight
            </CardTitle>
            <CardDescription>Knowledge gaps, evidence, and optional adaptive remediation.</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate('auto')}>
            <RefreshCw className="size-4" />
            Analyze
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {run.error ? <AIErrorRecovery message={run.error.message} onRetry={() => run.mutate('auto')} /> : null}
        {latest.data ? <SubmissionAnalysisResultShell analysis={latest.data} /> : null}
        <Button
          className="w-full"
          variant="secondary"
          disabled={remediation.isPending || !latest.data}
          onClick={() => remediation.mutate({ gate_mode: true, language: 'auto' })}
        >
          <Route className="size-4" />
          Generate remediation gate
        </Button>
        {remediation.data ? <RemediationResultShell session={remediation.data} /> : null}
        {remediation.error ? <AIErrorRecovery message={remediation.error.message} /> : null}
      </CardContent>
    </Card>
  )
}
