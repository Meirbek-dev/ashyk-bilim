import { ExternalLinkIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import { citationHref } from '../lib/ai-citations'
import type { AICitation } from '../lib/ai-citations'

type AICitationLinkProps = {
  citation: AICitation
}

export function AICitationLink({ citation }: AICitationLinkProps) {
  const href = citationHref(citation)
  if (!href) {
    return <Badge variant="outline">{citation.label}</Badge>
  }
  return (
    <Badge variant="outline" render={<a href={href} />}>
      {citation.label}
      <ExternalLinkIcon data-icon="inline-end" />
    </Badge>
  )
}
