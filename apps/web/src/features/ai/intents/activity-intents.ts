import type { AiIntent } from '../api/ai-event-contract'

export interface AiPromptIntent {
  id: AiIntent
  label: string
  prompt: string
}

export const activityPromptIntents: AiPromptIntent[] = [
  {
    id: 'tutor_answer',
    label: 'Explain',
    prompt: 'Explain the current activity using the course context.',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    prompt: 'Create flashcards for the most important ideas in this activity.',
  },
  {
    id: 'hint_ladder',
    label: 'Hints',
    prompt: 'Give me a step-by-step hint ladder without revealing the full solution.',
  },
]

export const authoringPromptIntents: AiPromptIntent[] = [
  {
    id: 'authoring_patch',
    label: 'Improve',
    prompt: 'Improve this selected course text while preserving its meaning and structure.',
  },
  {
    id: 'rubric_feedback',
    label: 'Critique',
    prompt: 'Review this selected course text and suggest concrete improvements.',
  },
]
