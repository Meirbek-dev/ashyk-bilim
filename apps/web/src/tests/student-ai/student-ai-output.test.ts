import { describe, expect, it } from 'vitest'
import type { FlashcardSetArtifact, HintLadderArtifact, TutorAnswerArtifact } from '@/features/ai/api/ai-event-contract'
import {
  composeStudentAiPrompt,
  createArtifactOutput,
  createTextOutput,
} from '@/features/student-ai/state/student-ai-output'

describe('student AI output mapping', () => {
  it('maps tutor answer artifacts to explanation output', () => {
    const output = createArtifactOutput({
      kind: 'tutor_answer',
      summary: 'Dependency injection keeps handlers testable.',
      content: 'Pass dependencies through application state instead of constructing them inside handlers.',
      citations: [],
      confidence: 0.91,
      policy_notes: [],
      next_actions: ['Find where state is created in the example.'],
    } satisfies TutorAnswerArtifact)

    expect(output.kind).toBe('explanation')
    expect(output.nextAction).toBe('Find where state is created in the example.')
    expect(output.confidence).toBe(0.91)
  })

  it('maps flashcards to practice items', () => {
    const output = createArtifactOutput({
      kind: 'flashcard_set',
      summary: 'Practice key terms.',
      cards: [
        {
          front: 'What does dependency injection reduce?',
          back: 'Hard coupling between handlers and concrete services.',
          difficulty: 'intro',
          citation_ids: [],
        },
      ],
      citations: [],
      confidence: 0.84,
      policy_notes: [],
      next_actions: [],
    } satisfies FlashcardSetArtifact)

    expect(output.kind).toBe('practice_set')
    expect(output.practiceItems?.[0]?.answer).toContain('Hard coupling')
  })

  it('keeps solution-revealing hint metadata visible', () => {
    const output = createArtifactOutput({
      kind: 'hint_ladder',
      summary: 'Step through the task.',
      steps: [
        {
          level: 1,
          title: 'Find the state',
          hint: 'Look for the router state setup.',
          reveals_solution: false,
          citation_ids: [],
        },
      ],
      citations: [],
      confidence: 0.75,
      policy_notes: [],
      next_actions: [],
    } satisfies HintLadderArtifact)

    expect(output.kind).toBe('hint_ladder')
    expect(output.hintSteps?.[0]?.revealsSolution).toBe(false)
  })

  it('creates mode-specific text fallback output', () => {
    const output = createTextOutput('debug', 'The failing test points to a missing state dependency.')

    expect(output.kind).toBe('code_diagnosis')
    expect(output.nextAction).toContain('Run')
  })

  it('composes selected text and student request into one prompt', () => {
    const prompt = composeStudentAiPrompt({
      modePrompt: 'Explain the activity.',
      selectionText: 'State<AppState>',
      userInput: 'Why does this help tests?',
    })

    expect(prompt).toContain('State<AppState>')
    expect(prompt).toContain('Why does this help tests?')
    expect(prompt).toContain('assessment boundaries')
  })
})
