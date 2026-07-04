import { ExternalLinkIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'

import { citationHref } from '../lib/ai-citations'
import type { AICitation } from '../lib/ai-citations'

interface AICitationLinkProps {
  citation: AICitation
}

export function AICitationLink({ citation }: AICitationLinkProps) {
  const t = useTranslations('AiExperience.evidencePanel')
  const href = citationHref(citation)
  if (!href) {
    return <Badge variant="outline">{citation.label}</Badge>
  }
  return (
    <Badge variant="outline" render={<a href={href} aria-label={t('openSource', { label: citation.label })} />}>
      {citation.label}
      <ExternalLinkIcon data-icon="inline-end" />
    </Badge>
  )
}
