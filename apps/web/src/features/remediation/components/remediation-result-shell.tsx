import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { AIResultShell, AIEvidencePanel, AIStreamingText } from '@/features/ai-experience'
import type { AICitation, AIWorkState } from '@/features/ai-experience'

import type { RemediationSession } from '../api/use-remediation'

export function RemediationResultShell({ session }: { session: RemediationSession }) {
  const t = useTranslations('AiExperience.remediation')
  const citations = useMemo(
    () => (session.lecture_json.citations ?? []) as AICitation[],
    [session.lecture_json.citations],
  )

  const contextValue = useMemo(
    () => ({
      title: session.lecture_json.title ?? t('title'),
      description: session.gate_mode ? t('activeGate') : t('assigned'),
      state: (session.status === 'passed' ? 'complete' : 'needs_human_review') as AIWorkState,
      citations,
    }),
    [session.lecture_json.title, session.gate_mode, session.status, citations, t],
  )

  return (
    <AIResultShell.Provider value={contextValue}>
      <AIResultShell.Frame>
        <AIResultShell.Header />
        <AIResultShell.Body>
          <AIStreamingText text={session.lecture_json.micro_lecture_markdown ?? ''} />
          <AIEvidencePanel citations={citations} />
        </AIResultShell.Body>
      </AIResultShell.Frame>
    </AIResultShell.Provider>
  )
}
