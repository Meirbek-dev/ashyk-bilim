import { BookOpenCheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { AICitationLink } from './ai-citation-link'
import { confidenceLabel } from '../lib/ai-citations'
import type { AICitation } from '../lib/ai-citations'

interface AIEvidencePanelProps {
  citations: AICitation[]
}

export function AIEvidencePanel({ citations }: AIEvidencePanelProps) {
  const t = useTranslations('AiExperience.evidencePanel')
  if (citations.length === 0) {
    return (
      <Alert>
        <BookOpenCheckIcon aria-hidden="true" />
        <AlertTitle>{t('noCitationsTitle')}</AlertTitle>
        <AlertDescription>{t('noCitationsDesc')}</AlertDescription>
      </Alert>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
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
