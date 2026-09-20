'use client'

import { useMemo, useState } from 'react'
import { aiLanguageFor } from '@/i18n/config'
import { BrainCircuit, FilePenLine, RefreshCw, Route } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AIArtifactLifecycle,
  AIEmptyState,
  AIErrorRecovery,
  AIRunProgress,
  useAIRunController,
} from '@/features/ai-experience'
import {
  RemediationLecture,
  RemediationResultShell,
  latestRemediationQueryOptions,
  useLatestRemediation,
  useQueueRemediation,
} from '@/features/remediation'
import type { RemediationView } from '@/features/remediation'

import {
  latestSubmissionAnalysisQueryOptions,
  useLatestSubmissionAnalysis,
  useQueueSubmissionAnalysis,
} from '../api/use-submission-analysis'
import type { SubmissionAnalysisView } from '../api/use-submission-analysis'
import { SubmissionAnalysisResultShell } from './submission-analysis-result-shell'

export function SubmissionAIEntry({
  hasFeedback = false,
  onDraftFeedback,
  submissionUuid,
}: {
  /** The feedback box already holds text — «Подготовить отзыв» asks before replacing it (UX-093). */
  hasFeedback?: boolean
  onDraftFeedback?: (feedback: string) => void
  submissionUuid: string | null
}) {
  const t = useTranslations('AiExperience.submissionAIEntry')
  const [confirmReplace, setConfirmReplace] = useState(false)
  // UX-139: a gate locks the learner out of the activity — ask first.
  const [confirmGate, setConfirmGate] = useState(false)
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
    invalidateQueryKeys: [latestRemediationQueryOptions(submissionUuid ?? '').queryKey],
    persistenceKey: `submission-remediation:${submissionUuid ?? 'none'}`,
    queue: queueRemediation,
  })
  // The stored session carries the live status (UX-115: «Исправление пройдено.» once the learner passed);
  // until it is fetched, the queued run's final artifact (the lecture bundle) stands in as an assigned gate.
  const storedSession = useLatestRemediation(submissionUuid ?? '')
  const artifactContent = remediation.latestArtifact?.content
  const remediationSession = useMemo<RemediationView | null>(() => {
    if (storedSession.data) return storedSession.data
    const lecture = RemediationLecture.safeParse(artifactContent)
    return lecture.success ? { gate_mode: true, lecture: lecture.data, status: 'assigned' } : null
  }, [storedSession.data, artifactContent])
  // BUG-179: `latest` puts the unpassed gate first — a second one would 409.
  const gateActive =
    remediationSession?.gate_mode === true && ['assigned', 'in_progress', 'failed'].includes(remediationSession.status)

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
              if (!latest.data) return
              if (hasFeedback) setConfirmReplace(true)
              else onDraftFeedback(buildFeedbackDraft(latest.data))
            }}
          >
            <FilePenLine data-icon="inline-start" aria-hidden="true" />
            {t('draftFeedback')}
          </Button>
        ) : null}
        <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('replaceFeedbackTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('replaceFeedbackDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('replaceFeedbackCancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (latest.data && onDraftFeedback) onDraftFeedback(buildFeedbackDraft(latest.data))
                  setConfirmReplace(false)
                }}
              >
                {t('replaceFeedbackConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          className="w-full"
          variant="secondary"
          disabled={remediation.pending || !latest.data || gateActive}
          onClick={() => setConfirmGate(true)}
        >
          <Route data-icon="inline-start" aria-hidden="true" />
          {gateActive ? t('gateAlreadyAssigned') : t('generateGate')}
        </Button>
        <AlertDialog open={confirmGate} onOpenChange={setConfirmGate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('gateConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('gateConfirmDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('replaceFeedbackCancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmGate(false)
                  void remediation.start({ gate_mode: true, language: aiLanguageFor(locale) })
                }}
              >
                {t('gateConfirmAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
