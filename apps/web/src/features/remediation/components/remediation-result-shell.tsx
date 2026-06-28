import { AIResultShell, AIEvidencePanel, AIStreamingText } from '@/features/ai-experience'
import type { AICitation } from '@/features/ai-experience'

import type { RemediationSession } from '../api/use-remediation'

export function RemediationResultShell({ session }: { session: RemediationSession }) {
  const citations = (session.lecture_json.citations ?? []) as AICitation[]
  return (
    <AIResultShell.Provider
      value={{
        title: session.lecture_json.title ?? 'Adaptive remediation',
        description: session.gate_mode
          ? 'Gate mode is active until the learner passes.'
          : 'Practice remediation is assigned.',
        state: session.status === 'passed' ? 'complete' : 'needs_human_review',
        citations,
      }}
    >
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
