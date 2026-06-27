'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StudentAiPracticeItem } from '../types'

export function StudentAiPracticeSet({ items }: { items: StudentAiPracticeItem[] }) {
  const [visibleAnswers, setVisibleAnswers] = useState<Set<string>>(() => new Set())

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(item => {
        const isVisible = visibleAnswers.has(item.id)
        return (
          <Card key={item.id} size="sm">
            <CardHeader>
              <CardTitle>{item.prompt}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {isVisible ? <p className="text-muted-foreground text-sm">{item.answer}</p> : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVisibleAnswers(previous => {
                    const next = new Set(previous)
                    if (next.has(item.id)) {
                      next.delete(item.id)
                    } else {
                      next.add(item.id)
                    }
                    return next
                  })
                }
              >
                {isVisible ? 'Hide answer' : 'Reveal answer'}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
