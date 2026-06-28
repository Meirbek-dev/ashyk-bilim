import { Badge } from '@/components/ui/badge'
import { AIResultShell, AIEvidencePanel } from '@/features/ai-experience'
import type { AICitation } from '@/features/ai-experience'

import type { SubmissionAnalysis } from '../api/use-submission-analysis'

export function SubmissionAnalysisResultShell({ analysis }: { analysis: SubmissionAnalysis }) {
  const citations = (analysis.analysis_json.citations ?? []) as AICitation[]
  return (
    <AIResultShell.Provider
      value={{
        title: `${analysis.gap_count} knowledge gaps`,
        description: analysis.analysis_json.summary ?? 'Submission analysis is ready.',
        state: 'complete',
        confidence: analysis.analysis_json.confidence,
        modelName: analysis.model_name,
        citations,
      }}
    >
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
