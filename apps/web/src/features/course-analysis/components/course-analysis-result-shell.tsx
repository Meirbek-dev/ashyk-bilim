'use client'

import { AIResultShell, AIEvidencePanel, AIActionButton } from '@/features/ai-experience'
import type { AICitation } from '@/features/ai-experience'

import type { CourseAnalysis } from '../api/use-course-analysis'

interface CourseAnalysisResultShellProps {
  analysis: CourseAnalysis
  onPublish?: () => void
  publishing?: boolean
}

export function CourseAnalysisResultShell({ analysis, onPublish, publishing }: CourseAnalysisResultShellProps) {
  const citations = (analysis.report_json.citations ?? []) as AICitation[]
  return (
    <AIResultShell.Provider
      value={{
        title: `Course quality score ${analysis.public_score}`,
        description: analysis.report_json.summary ?? 'Course analysis is ready for review.',
        state: analysis.status === 'published' ? 'complete' : 'needs_human_review',
        confidence: analysis.report_json.confidence,
        modelName: analysis.model_name,
        citations,
      }}
    >
      <AIResultShell.Frame>
        <AIResultShell.Header
          action={
            onPublish ? (
              <AIActionButton size="sm" pending={publishing} onClick={onPublish}>
                Publish score
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
