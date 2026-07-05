'use client'

import { BookOpenCheck, FileQuestion, Lightbulb, ListChecks, Route, SearchCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

export type AICommandSurface = 'course' | 'activity' | 'submission' | 'analytics'

export interface AICommand {
  id: AICommandId
  label: string
  prompt: string
  surface: AICommandSurface
}

type AICommandId =
  | 'activity-check'
  | 'activity-explain'
  | 'analytics-risk'
  | 'course-map'
  | 'course-practice'
  | 'course-sources'
  | 'submission-remediate'
  | 'submission-review'

interface AICommandDefinition {
  id: AICommandId
  surface: AICommandSurface
}

// Labels and prompts live in the `AiExperience.commandList` next-intl namespace, not here —
// this registry only fixes which command ids exist per surface and which icon each one uses.
const COMMANDS: Record<AICommandSurface, AICommandDefinition[]> = {
  activity: [
    { id: 'activity-explain', surface: 'activity' },
    { id: 'activity-check', surface: 'activity' },
  ],
  analytics: [{ id: 'analytics-risk', surface: 'analytics' }],
  course: [
    { id: 'course-map', surface: 'course' },
    { id: 'course-sources', surface: 'course' },
    { id: 'course-practice', surface: 'course' },
  ],
  submission: [
    { id: 'submission-review', surface: 'submission' },
    { id: 'submission-remediate', surface: 'submission' },
  ],
}

const COMMAND_ICONS = {
  'activity-check': ListChecks,
  'activity-explain': Lightbulb,
  'analytics-risk': Route,
  'course-map': BookOpenCheck,
  'course-practice': FileQuestion,
  'course-sources': SearchCheck,
  'submission-remediate': Route,
  'submission-review': Lightbulb,
} satisfies Record<AICommandId, AppIcon>

export function AICommandList({
  disabled,
  onCommand,
  surface,
}: {
  disabled?: boolean
  onCommand: (command: AICommand) => void
  surface: AICommandSurface
}) {
  const t = useTranslations('AiExperience.commandList')

  return (
    <div className="flex flex-wrap gap-2">
      {COMMANDS[surface].map(definition => {
        const Icon = COMMAND_ICONS[definition.id]
        const label = t(`${definition.id}.label`)
        const prompt = t(`${definition.id}.prompt`)
        return (
          <Button
            key={definition.id}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onCommand({ ...definition, label, prompt })}
          >
            <Icon data-icon="inline-start" aria-hidden="true" />
            {label}
          </Button>
        )
      })}
    </div>
  )
}
