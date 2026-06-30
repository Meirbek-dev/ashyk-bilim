import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { AIResultShell, AIEvidencePanel } from '@/features/ai-experience'
import type { AICitation, AIResultShellContextValue } from '@/features/ai-experience'

import type { LectureReview } from '../api/use-lecture-authoring-ai'

export function LectureReviewPanel({ review }: { review: LectureReview }) {
  const t = useTranslations('AiExperience.lectureReview')
  const citations = useMemo(
    () => (review.suggestions_json.citations ?? []) as AICitation[],
    [review.suggestions_json.citations],
  )
  const dismissed = review.dismissed_json ?? {}
  const suggestions = (review.suggestions_json.suggestions ?? []).filter(item => !dismissed[item.suggestion_id])

  const contextValue: AIResultShellContextValue = useMemo(
    () => ({
      title: t('title'),
      description: review.suggestions_json.summary ?? t('defaultDescription'),
      state: suggestions.length > 0 ? 'needs_human_review' : 'complete',
      citations,
    }),
    [review.suggestions_json.summary, suggestions.length, citations, t],
  )

  return (
    <AIResultShell.Provider value={contextValue}>
      <AIResultShell.Frame>
        <AIResultShell.Header />
        <AIResultShell.Body>
          <div className="flex flex-col gap-2">
            {suggestions.map(suggestion => (
              <article key={suggestion.suggestion_id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{suggestion.title}</h3>
                  <Badge variant="secondary">{suggestion.priority}</Badge>
                  <span className="text-muted-foreground text-xs">{suggestion.location}</span>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{suggestion.rationale}</p>
              </article>
            ))}
          </div>
          <AIEvidencePanel citations={citations} />
        </AIResultShell.Body>
      </AIResultShell.Frame>
    </AIResultShell.Provider>
  )
}
