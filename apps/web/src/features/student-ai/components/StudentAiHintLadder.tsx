'use client'

import { LockIcon, UnlockIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { StudentAiHintStep } from '../types'

export function StudentAiHintLadder({ steps }: { steps: StudentAiHintStep[] }) {
  const [visibleCount, setVisibleCount] = useState(1)

  return (
    <div className="border-border/70 flex flex-col rounded-lg border">
      {steps.map((step, index) => {
        const isVisible = index < visibleCount
        return (
          <div key={step.id} className="flex flex-col">
            {index > 0 ? <Separator /> : null}
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-medium">{step.title}</h4>
                {isVisible ? (
                  <UnlockIcon aria-hidden="true" className="text-primary size-4" />
                ) : (
                  <LockIcon aria-hidden="true" className="text-muted-foreground size-4" />
                )}
              </div>
              {isVisible ? (
                <p className="text-muted-foreground text-sm">{step.hint}</p>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setVisibleCount(index + 1)}>
                  Reveal this hint
                </Button>
              )}
              {step.revealsSolution ? (
                <p className="text-muted-foreground text-xs">This hint may reveal the answer.</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
