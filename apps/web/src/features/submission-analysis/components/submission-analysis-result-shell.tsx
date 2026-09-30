import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { AIResultShell, AIEvidencePanel } from '@/features/ai-experience'
import type { AICitation } from '@/features/ai-experience'

import type { SubmissionAnalysisView } from '../api/use-submission-analysis'

export function SubmissionAnalysisResultShell({ analysis }: { analysis: SubmissionAnalysisView }) {
  const t = useTranslations('AiExperience.submissionAnalysisResultShell')
  const citations = useMemo(() => (analysis.analysis.citations ?? []) as AICitation[], [analysis.analysis.citations])

  const contextValue = useMemo(
    () => ({
      title: t('title', { count: analysis.gap_count }),
      description: analysis.analysis.summary ?? t('defaultDescription'),
      state: 'complete' as const,
      confidence: analysis.analysis.confidence,
      modelName: analysis.model_name,
      citations,
    }),
    [analysis.gap_count, analysis.analysis.summary, analysis.analysis.confidence, analysis.model_name, citations, t],
  )

  return (
    <AIResultShell.Provider value={contextValue}>
      <AIResultShell.Frame>
        <AIResultShell.Header />
        <AIResultShell.Body>
          <div className="flex flex-col gap-2">
            {(analysis.analysis.knowledge_gaps ?? []).map(gap => (
              <div key={gap.concept} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{gap.concept}</p>
                  <Badge variant={gap.severity === 'high' ? 'destructive' : 'secondary'}>
                    {t.has(`severities.${gap.severity}`) ? t(`severities.${gap.severity}`) : gap.severity}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{gap.remediation_goal}</p>
              </div>
            ))}
          </div>
          <AIEvidencePanel citations={citations} />
        </AIResultShell.Body>
        <AIResultShell.AuditMetadata />
      </AIResultShell.Frame>
    </AIResultShell.Provider>
  )
}
