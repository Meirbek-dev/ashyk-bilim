import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { AIResultShell, AIEvidencePanel, AIActionButton } from '@/features/ai-experience'
import type { AICitation, AIResultShellContextValue } from '@/features/ai-experience'

import type { CourseAnalysis } from '../api/use-course-analysis'

interface CourseAnalysisResultShellProps {
  analysis: CourseAnalysis
  onPublish?: () => void
  publishing?: boolean
}

export function CourseAnalysisResultShell({ analysis, onPublish, publishing }: CourseAnalysisResultShellProps) {
  const t = useTranslations('AiExperience.courseAnalysisResultShell')
  const citations = useMemo(
    () => (analysis.report_json.citations ?? []) as AICitation[],
    [analysis.report_json.citations],
  )

  const contextValue: AIResultShellContextValue = useMemo(
    () => ({
      title: t('title', { score: analysis.public_score }),
      description: analysis.report_json.summary ?? t('defaultDescription'),
      state: analysis.status === 'published' ? 'complete' : 'needs_human_review',
      confidence: analysis.report_json.confidence,
      modelName: analysis.model_name,
      citations,
    }),
    [
      analysis.public_score,
      analysis.report_json.summary,
      analysis.status,
      analysis.report_json.confidence,
      analysis.model_name,
      citations,
      t,
    ],
  )

  return (
    <AIResultShell.Provider value={contextValue}>
      <AIResultShell.Frame>
        <AIResultShell.Header
          action={
            onPublish ? (
              <AIActionButton size="sm" pending={publishing} onClick={onPublish}>
                {t('publishScore')}
              </AIActionButton>
            ) : null
          }
        />
        <AIResultShell.StatusTimeline />
        <AIResultShell.Body>
          <AIEvidencePanel citations={citations} />
        </AIResultShell.Body>
        <AIResultShell.AuditMetadata />
      </AIResultShell.Frame>
    </AIResultShell.Provider>
  )
}
