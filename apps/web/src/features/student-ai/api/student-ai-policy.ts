import { BrainIcon, BugIcon, CheckSquareIcon, HelpCircleIcon, Layers3Icon, Repeat2Icon } from 'lucide-react'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'
import type { StudentAiAvailability, StudentAiModeConfig } from '../types'

const understandMode: StudentAiModeConfig = {
  id: 'understand',
  label: 'Understand',
  shortLabel: 'Understand',
  description: 'Explain the current activity with course context and a concrete next step.',
  prompt: 'Explain the current activity with course context. Use a short key idea, one example, and one next step.',
  intent: 'tutor_answer',
  icon: BrainIcon,
}

const practiceMode: StudentAiModeConfig = {
  id: 'practice',
  label: 'Practice',
  shortLabel: 'Practice',
  description: 'Create recall questions so the student can check understanding without grades.',
  prompt: 'Create a short practice set from this activity. Include answers and keep it ungraded.',
  intent: 'flashcards',
  icon: Repeat2Icon,
}

const hintMode: StudentAiModeConfig = {
  id: 'hint',
  label: 'Hint ladder',
  shortLabel: 'Hint',
  description: 'Give progressive hints without revealing a final answer.',
  prompt: 'Give a progressive hint ladder. Do not reveal the full solution unless the activity policy allows it.',
  intent: 'hint_ladder',
  icon: HelpCircleIcon,
}

const debugMode: StudentAiModeConfig = {
  id: 'debug',
  label: 'Debug',
  shortLabel: 'Debug',
  description: 'Explain likely code issues, relevant tests, and the smallest next action.',
  prompt: 'Diagnose the code challenge at a conceptual level. Explain the likely issue and the smallest next action.',
  intent: 'code_review_hint',
  icon: BugIcon,
}

const submitMode: StudentAiModeConfig = {
  id: 'submit',
  label: 'Check submission',
  shortLabel: 'Submit',
  description: 'Check coverage against the task without writing the final submission.',
  prompt: 'Check the submission against the activity requirements. Do not write the final work for the student.',
  intent: 'rubric_feedback',
  icon: CheckSquareIcon,
}

const reflectMode: StudentAiModeConfig = {
  id: 'reflect',
  label: 'Reflect',
  shortLabel: 'Reflect',
  description: 'Summarize what to review next from the current activity.',
  prompt: 'Help the student reflect on this activity and identify what to review next.',
  intent: 'tutor_answer',
  icon: Layers3Icon,
}

const modesByActivityType: Record<string, StudentAiModeConfig[]> = {
  TYPE_DYNAMIC: [understandMode, practiceMode, reflectMode],
  TYPE_DOCUMENT: [understandMode, practiceMode, reflectMode],
  TYPE_VIDEO: [understandMode, practiceMode, reflectMode],
  TYPE_CODE_CHALLENGE: [debugMode, hintMode, practiceMode],
  TYPE_FILE_SUBMISSION: [submitMode, understandMode, reflectMode],
  TYPE_CUSTOM: [understandMode, practiceMode],
  TYPE_EXAM: [hintMode],
}

export function resolveStudentAiAvailability({
  hasActivity,
  isAttemptActive,
  runtime,
}: {
  hasActivity: boolean
  isAttemptActive: boolean
  runtime: StudentActivityRuntime
}): StudentAiAvailability {
  const activityTitle = runtime.activity?.title ?? runtime.course.title
  const activityType = runtime.activity?.type ?? ''
  const isLocked = runtime.progress.state === 'locked' || runtime.progress.state === 'unavailable'
  const baseContext = [
    {
      id: 'current-activity',
      label: 'Current activity',
      detail: activityTitle,
      state: 'active' as const,
    },
    {
      id: 'course-progress',
      label: 'Progress state',
      detail: runtime.progress.complete ? 'Marked complete' : 'In progress',
      state: 'available' as const,
    },
  ]

  if (!hasActivity || !runtime.activity) {
    return {
      state: 'disabled',
      reason: 'AI study support is available inside course activities.',
      modes: [],
      context: baseContext,
      safety: {
        level: 'blocked',
        title: 'No activity context',
        description: 'Open a course activity before using AI study support.',
      },
    }
  }

  if (isLocked || !runtime.permissions.can_view) {
    return {
      state: 'disabled',
      reason: 'This activity is not available yet.',
      modes: [],
      context: baseContext,
      safety: {
        level: 'blocked',
        title: 'Activity unavailable',
        description: 'AI cannot reveal locked or unavailable course material.',
      },
    }
  }

  if (isAttemptActive || activityType === 'TYPE_EXAM') {
    return {
      state: 'restricted',
      reason: 'AI is limited during assessed work.',
      modes: modesByActivityType.TYPE_EXAM ?? [hintMode],
      context: [
        ...baseContext,
        {
          id: 'assessment-boundary',
          label: 'Assessment boundary',
          detail: 'Hints can guide concepts but cannot solve graded questions.',
          state: 'restricted',
        },
      ],
      safety: {
        level: 'limited',
        title: 'Assessment limit',
        description: 'AI can provide conceptual hints only. It will not solve assessed work.',
      },
    }
  }

  const modes = modesByActivityType[activityType] ?? [understandMode, practiceMode]

  return {
    state: 'enabled',
    reason: 'AI can use this activity as study context.',
    modes,
    context: baseContext,
    safety: {
      level: 'permitted',
      title: 'Study support',
      description: 'AI suggestions stay separate from course progress and grades until you choose an action.',
    },
  }
}
