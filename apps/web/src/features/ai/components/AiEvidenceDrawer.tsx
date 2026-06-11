'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EvidenceCitation } from '../api/ai-event-contract'

export interface AiEvidenceDrawerProps {
  citations: EvidenceCitation[]
  className?: string
}

export function AiEvidenceDrawer({ citations, className }: AiEvidenceDrawerProps) {
  if (citations.length === 0) return null

  return (
    <aside className={cn('flex max-h-44 flex-col gap-2 overflow-y-auto border-t p-3', className)} aria-label="Evidence">
      {citations.map(citation => (
        <figure key={citation.id} className="bg-background flex flex-col gap-1 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2">
            <figcaption className="truncate text-sm font-medium">{citation.label}</figcaption>
            <Badge variant="outline">{citation.source_type}</Badge>
          </div>
          <blockquote className="text-muted-foreground line-clamp-2 text-xs">{citation.excerpt}</blockquote>
        </figure>
      ))}
    </aside>
  )
}
