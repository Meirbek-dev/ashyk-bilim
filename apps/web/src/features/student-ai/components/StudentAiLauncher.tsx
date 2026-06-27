'use client'

import { SparklesIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StudentAiAvailability } from '../types'

const STUDY_AI_LABEL = 'Ashyk AI'
const LIMITED_LABEL = 'limited'

export function StudentAiLauncher({
  availability,
  open,
  onOpenChange,
}: {
  availability: StudentAiAvailability
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (availability.state === 'disabled') return null

  return (
    <Button
      type="button"
      variant={open ? 'default' : 'outline'}
      size="sm"
      aria-expanded={open}
      aria-label="Ashyk AI study tools"
      onClick={() => onOpenChange(!open)}
      className="h-8 rounded-full"
    >
      <SparklesIcon data-icon="inline-start" />
      <span className="hidden sm:inline">{STUDY_AI_LABEL}</span>
      {availability.state === 'restricted' ? (
        <Badge variant="warning" className="ms-1 -me-1 hidden sm:inline-flex">
          {LIMITED_LABEL}
        </Badge>
      ) : null}
    </Button>
  )
}
