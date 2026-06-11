'use client'

import { CheckIcon, Loader2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ToolProgressEvent } from '../api/ai-event-contract'

export interface AiToolTimelineProps {
  events: ToolProgressEvent[]
  className?: string
}

export function AiToolTimeline({ events, className }: AiToolTimelineProps) {
  if (events.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-2 border-b p-3', className)} aria-label="AI progress">
      {events.slice(-4).map(event => (
        <div key={event.event_id} className="flex min-w-0 items-center gap-2 text-sm">
          {event.payload.status === 'complete' ? (
            <CheckIcon className="text-primary size-4" aria-hidden="true" />
          ) : (
            <Loader2Icon className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">{event.payload.label}</span>
          <Badge variant={event.payload.status === 'complete' ? 'secondary' : 'outline'}>{event.payload.status}</Badge>
        </div>
      ))}
    </div>
  )
}
