import { BookOpenCheckIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { AICitationLink } from './ai-citation-link'
import { confidenceLabel } from '../lib/ai-citations'
import type { AICitation } from '../lib/ai-citations'

type AIEvidencePanelProps = {
  citations: AICitation[]
}

export function AIEvidencePanel({ citations }: AIEvidencePanelProps) {
  if (citations.length === 0) {
    return (
      <Alert>
        <BookOpenCheckIcon aria-hidden="true" />
        <AlertTitle>No citations yet</AlertTitle>
        <AlertDescription>The result needs course evidence before it can be trusted.</AlertDescription>
      </Alert>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence</CardTitle>
        <CardDescription>Sources the AI used for this result.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {citations.map(citation => (
          <article key={citation.citation_id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <AICitationLink citation={citation} />
              <span className="text-muted-foreground text-xs">{confidenceLabel(citation.confidence)}</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{citation.excerpt}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  )
}
