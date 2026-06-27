'use client'

import { CheckCircle2Icon, FileTextIcon, LockIcon, MousePointer2Icon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { StudentAiAvailability, StudentAiSelection } from '../types'

const CONTEXT_LENS_TITLE = 'Context lens'

export function StudentAiContextLens({
  availability,
  selection,
}: {
  availability: StudentAiAvailability
  selection: StudentAiSelection
}) {
  const [expanded, setExpanded] = useState(false)
  const contextItems = selection.text
    ? [
        {
          id: 'selected-text',
          label: 'Selected text',
          detail: selection.text,
          state: 'active' as const,
        },
        ...availability.context,
      ]
    : availability.context

  return (
    <section className="flex flex-col gap-3" aria-label="AI context lens">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
            {selection.text ? (
              <MousePointer2Icon aria-hidden="true" className="size-4" />
            ) : (
              <FileTextIcon aria-hidden="true" className="size-4" />
            )}
          </span>
          <div>
            <h3 className="text-sm font-medium">{CONTEXT_LENS_TITLE}</h3>
            <p className="text-muted-foreground text-xs">
              {selection.text ? 'Focused on your selected text' : 'Using the current activity'}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Hide' : 'Inspect'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {contextItems.slice(0, expanded ? contextItems.length : 2).map(item => (
          <Badge key={item.id} variant={item.state === 'restricted' ? 'warning' : 'outline'} className="max-w-full">
            {item.state === 'restricted' ? <LockIcon aria-hidden="true" /> : <CheckCircle2Icon aria-hidden="true" />}
            <span className="truncate">{item.label}</span>
          </Badge>
        ))}
      </div>

      {expanded ? (
        <div className="border-border/70 flex flex-col gap-2 rounded-lg border p-2">
          {contextItems.map((item, index) => (
            <div key={item.id} className="flex flex-col gap-2">
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{item.label}</span>
                  <Badge variant={item.state === 'restricted' ? 'warning' : 'secondary'}>{item.state}</Badge>
                </div>
                <p className="text-muted-foreground line-clamp-4 text-xs">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
