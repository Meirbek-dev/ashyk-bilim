import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { AIResultShell, AIEvidencePanel, AIStreamingText } from '@/features/ai-experience'
import type { AICitation, AIResultShellContextValue } from '@/features/ai-experience'

import type { RemediationSessionView } from '../api/use-remediation'

/** A stored session, or a run artifact's lecture wrapped with the gate/status it was queued with. */
export type RemediationView = Pick<RemediationSessionView, 'gate_mode' | 'lecture' | 'status'>

export function RemediationResultShell({ session }: { session: RemediationView }) {
  const t = useTranslations('AiExperience.remediation')
  const citations = useMemo(() => (session.lecture.citations ?? []) as AICitation[], [session.lecture.citations])

  const contextValue: AIResultShellContextValue = useMemo(
    () => ({
      title: session.lecture.title || t('title'),
      description: session.gate_mode ? t('activeGate') : t('assigned'),
      state: session.status === 'passed' ? 'complete' : 'needs_human_review',
      citations,
    }),
    [session.lecture.title, session.gate_mode, session.status, citations, t],
  )

  return (
    <AIResultShell.Provider value={contextValue}>
      <AIResultShell.Frame>
        <AIResultShell.Header />
        <AIResultShell.Body>
          <AIStreamingText text={session.lecture.micro_lecture_markdown} />
          <AIEvidencePanel citations={citations} />
        </AIResultShell.Body>
      </AIResultShell.Frame>
    </AIResultShell.Provider>
  )
}
