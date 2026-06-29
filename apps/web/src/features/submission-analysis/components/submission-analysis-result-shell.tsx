import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { AIResultShell, AIEvidencePanel } from '@/features/ai-experience'
import type { AICitation } from '@/features/ai-experience'

import type { SubmissionAnalysis } from '../api/use-submission-analysis'

export function SubmissionAnalysisResultShell({ analysis }: { analysis: SubmissionAnalysis }) {
  const t = useTranslations('AiExperience.submissionAnalysisResultShell')
  const citations = useMemo(
    () => (analysis.analysis_json.citations ?? []) as AICitation[],
    [analysis.analysis_json.citations],
  )

  const contextValue = useMemo(
    () => ({
      title: t('title', { count: analysis.gap_count }),
      description: analysis.analysis_json.summary ?? t('defaultDescription'),
      state: 'complete' as const,
      confidence: analysis.analysis_json.confidence,
      modelName: analysis.model_name,
      citations,
    }),
    [
      analysis.gap_count,
      analysis.analysis_json.summary,
      analysis.analysis_json.confidence,
      analysis.model_name,
      citations,
      t,
    ],
  )

  return (
    <AIResultShell.Provider value={contextValue}>
      <AIResultShell.Frame>
        <AIResultShell.Header />
        <AIResultShell.Body>
          <div className="flex flex-col gap-2">
            {(analysis.analysis_json.knowledge_gaps ?? []).map(gap => (
              <div key={gap.concept} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{gap.concept}</p>
                  <Badge variant="secondary">{gap.severity}</Badge>
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
