'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { StudentAiMode, StudentAiModeConfig } from '../types'

const MODE_PICKER_TITLE = 'Choose a study mode'

export function StudentAiModePicker({
  modes,
  value,
  onValueChange,
}: {
  modes: StudentAiModeConfig[]
  value: StudentAiMode
  onValueChange: (mode: StudentAiMode) => void
}) {
  if (modes.length === 0) return null
  const availableLabel = `${modes.length} available`

  return (
    <section className="flex flex-col gap-2" aria-label="AI study modes">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{MODE_PICKER_TITLE}</h3>
        <span className="text-muted-foreground text-xs">{availableLabel}</span>
      </div>
      <ToggleGroup
        value={[value]}
        onValueChange={(nextValue: string[]) => {
          const nextMode = nextValue[0] as StudentAiMode | undefined
          if (nextMode) onValueChange(nextMode)
        }}
        className="grid w-full grid-cols-2 items-stretch sm:grid-cols-3"
        spacing={1}
      >
        {modes.map(mode => {
          const Icon = mode.icon
          return (
            <ToggleGroupItem
              key={mode.id}
              value={mode.id}
              variant="outline"
              className="h-auto min-h-14 flex-col items-start justify-start gap-1 p-2 text-start whitespace-normal"
              aria-label={mode.label}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Icon aria-hidden="true" className="size-3.5" />
                {mode.shortLabel}
              </span>
              <span className="text-muted-foreground line-clamp-2 text-[0.72rem] leading-snug">{mode.description}</span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </section>
  )
}
