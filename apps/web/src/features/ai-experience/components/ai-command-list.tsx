'use client'

import { BookOpenCheck, FileQuestion, Lightbulb, ListChecks, Route, SearchCheck } from 'lucide-react'

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

const COMMANDS: Record<AICommandSurface, AICommand[]> = {
  activity: [
    {
      id: 'activity-explain',
      label: 'Explain this activity',
      prompt: 'Explain the current activity in plain language and list the next action I should take.',
      surface: 'activity',
    },
    {
      id: 'activity-check',
      label: 'Check my understanding',
      prompt: 'Ask me three short questions to check whether I understand this activity.',
      surface: 'activity',
    },
  ],
  analytics: [
    {
      id: 'analytics-risk',
      label: 'Draft intervention',
      prompt: 'Draft a concrete learner intervention using the current risk evidence and recommended action.',
      surface: 'analytics',
    },
  ],
  course: [
    {
      id: 'course-map',
      label: 'Map the course',
      prompt: 'Summarize this course as a learning path with prerequisites, checkpoints, and likely blockers.',
      surface: 'course',
    },
    {
      id: 'course-sources',
      label: 'Find sources',
      prompt: 'List the course sources that support the answer and explain which activity each source comes from.',
      surface: 'course',
    },
    {
      id: 'course-practice',
      label: 'Generate practice',
      prompt: 'Create a short practice plan from the next unfinished course activities.',
      surface: 'course',
    },
  ],
  submission: [
    {
      id: 'submission-review',
      label: 'Review feedback',
      prompt: 'Explain the feedback on this submission and identify the first revision step.',
      surface: 'submission',
    },
    {
      id: 'submission-remediate',
      label: 'Draft remediation',
      prompt: 'Create a remediation plan from the submission evidence and cite the source of each gap.',
      surface: 'submission',
    },
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
  return (
    <div className="flex flex-wrap gap-2">
      {COMMANDS[surface].map(command => {
        const Icon = COMMAND_ICONS[command.id]
        return (
          <Button
            key={command.id}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onCommand(command)}
          >
            <Icon data-icon="inline-start" aria-hidden="true" />
            {command.label}
          </Button>
        )
      })}
    </div>
  )
}
