import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { Button } from '#/shared/ui/button'

import { gateHolds } from '../model/ai'
import {
  remediationKey,
  remediationOptions,
  remediationQueue,
  submissionAnalysisKey,
  submissionAnalysisOptions,
  submissionAnalysisQueue,
} from '../queries'
import { AssignGate } from './assign-gate'
import { RunStatus } from './run-status'
import { SubmissionAnalysisView } from './submission-analysis-view'
import { useAiRun } from './use-ai-run'

/** The latest analysis of the work and its remediation gate, each with its own run (B-AI-16, B-AI-17). */
export function SubmissionAiBody({ submissionId }: { submissionId: string }) {
  const { data: analysis } = useSuspenseQuery(submissionAnalysisOptions(submissionId))
  const { data: gate } = useSuspenseQuery(remediationOptions(submissionId))
  const analyze = useAiRun(submissionAnalysisQueue(submissionId), [submissionAnalysisKey(submissionId)])
  const assign = useAiRun(remediationQueue(submissionId), [remediationKey(submissionId)])
  const startAnalysis = () => analyze.start(getLocale())
  const startGate = () => assign.start(getLocale())
  const holding = gate !== null && gateHolds(gate.status)
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{m.ai_submission_title()}</h3>
      <div>
        <Button variant="outline" disabled={analyze.pending} onClick={startAnalysis}>
          {analysis ? m.ai_reanalyze() : m.ai_analyze()}
        </Button>
      </div>
      <RunStatus
        state={analyze.state}
        onCancel={analyze.cancel}
        cancelling={analyze.cancelling}
        onRetry={startAnalysis}
      />
      {analysis ? (
        <SubmissionAnalysisView analysis={analysis} />
      ) : (
        <p className="text-sm text-muted-foreground">{m.ai_submission_empty()}</p>
      )}
      <div className="flex flex-col items-start gap-2 border-t pt-4">
        {gate?.status === 'passed' ? <p className="text-sm">{m.ai_gate_passed()}</p> : null}
        {holding ? <p className="text-sm">{m.ai_gate_assigned()}</p> : null}
        {analysis ? null : <p className="text-sm text-muted-foreground">{m.ai_gate_needs_analysis()}</p>}
        <AssignGate disabled={!analysis || holding || assign.pending} onConfirm={startGate} />
        <RunStatus state={assign.state} onCancel={assign.cancel} cancelling={assign.cancelling} onRetry={startGate} />
      </div>
    </section>
  )
}
