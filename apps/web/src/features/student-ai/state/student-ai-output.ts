import type { TextPart } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-react'
import type { AiArtifact } from '@/features/ai/api/ai-event-contract'
import type { StudentAiMode, StudentAiOutput } from '../types'

export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.content)
    .join('')
}

export function getLatestAssistantText(messages: UIMessage[]): string {
  const latestAssistant = [...messages].toReversed().find(message => message.role === 'assistant')
  return latestAssistant ? getMessageText(latestAssistant).trim() : ''
}

export function createEmptyOutput(mode: StudentAiMode): StudentAiOutput {
  switch (mode) {
    case 'practice': {
      return {
        kind: 'empty',
        title: 'Build practice from this activity',
        summary: 'Choose Practice to turn the current activity into quick recall questions.',
        citations: [],
      }
    }
    case 'hint': {
      return {
        kind: 'empty',
        title: 'Ask for a hint ladder',
        summary: 'Hints reveal one step at a time and avoid final answers during assessed work.',
        citations: [],
      }
    }
    case 'debug': {
      return {
        kind: 'empty',
        title: 'Diagnose the next code move',
        summary: 'Use Debug to explain errors, test cases, and the smallest next action.',
        citations: [],
      }
    }
    case 'submit': {
      return {
        kind: 'empty',
        title: 'Check before submitting',
        summary: 'Use Submit to compare your work with requirements without generating the final answer.',
        citations: [],
      }
    }
    case 'reflect': {
      return {
        kind: 'empty',
        title: 'Review what to study next',
        summary: 'Use Reflect after reading to identify the next concept to revisit.',
        citations: [],
      }
    }
    case 'understand': {
      return {
        kind: 'empty',
        title: 'Understand this activity',
        summary: 'Start with a short explanation grounded in the current activity.',
        citations: [],
      }
    }
  }
}

export function createLoadingOutput(mode: StudentAiMode, statusMessage: string | null): StudentAiOutput {
  return {
    kind: 'loading',
    title: mode === 'practice' ? 'Preparing practice' : 'Reading activity context',
    summary: statusMessage ?? 'AI is building a structured study response.',
    citations: [],
  }
}

export function createTextOutput(mode: StudentAiMode, text: string): StudentAiOutput {
  const summary = text || 'No response text was returned.'
  switch (mode) {
    case 'practice': {
      return {
        kind: 'practice_set',
        title: 'Practice set',
        summary: 'Use these questions to check recall before moving on.',
        body: text,
        practiceItems: [
          {
            id: 'practice-1',
            prompt: 'Explain the main idea in your own words.',
            answer: summary,
          },
          {
            id: 'practice-2',
            prompt: 'Name one detail you would verify in the activity.',
            answer: 'Check the current activity text and compare it with the AI explanation.',
          },
        ],
        citations: [],
      }
    }
    case 'hint': {
      return {
        kind: 'hint_ladder',
        title: 'Hint ladder',
        summary: 'Open each hint only when you need the next step.',
        hintSteps: [
          { id: 'hint-1', title: 'Start here', hint: summary, revealsSolution: false },
          {
            id: 'hint-2',
            title: 'Check your reasoning',
            hint: 'Compare your answer with the activity context.',
            revealsSolution: false,
          },
        ],
        citations: [],
      }
    }
    case 'debug': {
      return {
        kind: 'code_diagnosis',
        title: 'Code diagnosis',
        summary: 'Focus on the smallest next testable change.',
        body: text,
        nextAction: 'Run the smallest failing case again after one change.',
        citations: [],
      }
    }
    case 'submit': {
      return {
        kind: 'submission_checklist',
        title: 'Submission checklist',
        summary: 'Check coverage before submitting your own work.',
        body: text,
        checklist: [
          'Matches the activity requirement',
          'Uses your own final wording',
          'Includes the requested evidence',
        ],
        citations: [],
      }
    }
    case 'reflect': {
      return {
        kind: 'reflection',
        title: 'Review path',
        summary: 'Use this to decide what to revisit next.',
        body: text,
        nextAction: 'Write one sentence about what still feels unclear.',
        citations: [],
      }
    }
    case 'understand': {
      return {
        kind: 'explanation',
        title: 'Explanation',
        summary: 'Key idea from the current activity.',
        body: text,
        nextAction: 'Try restating the explanation before continuing.',
        citations: [],
      }
    }
  }
}

export function createArtifactOutput(artifact: AiArtifact): StudentAiOutput {
  switch (artifact.kind) {
    case 'tutor_answer': {
      const tutor = artifact
      return {
        kind: 'explanation',
        title: 'Explanation',
        summary: tutor.summary,
        body: tutor.content,
        ...(tutor.next_actions[0] ? { nextAction: tutor.next_actions[0] } : {}),
        citations: tutor.citations,
        confidence: tutor.confidence,
      }
    }
    case 'flashcard_set': {
      const flashcards = artifact
      return {
        kind: 'practice_set',
        title: 'Practice set',
        summary: flashcards.summary,
        practiceItems: flashcards.cards.map((card, index) => ({
          id: `${card.front}-${index}`,
          prompt: card.front,
          answer: card.back,
        })),
        citations: flashcards.citations,
        confidence: flashcards.confidence,
      }
    }
    case 'hint_ladder': {
      const hints = artifact
      return {
        kind: 'hint_ladder',
        title: 'Hint ladder',
        summary: hints.summary,
        hintSteps: hints.steps.map(step => ({
          id: `${step.level}-${step.title}`,
          title: step.title,
          hint: step.hint,
          revealsSolution: step.reveals_solution,
        })),
        citations: hints.citations,
        confidence: hints.confidence,
      }
    }
    case 'code_review_hint': {
      const code = artifact
      return {
        kind: 'code_diagnosis',
        title: 'Code diagnosis',
        summary: code.issue,
        body: code.related_test ?? artifact.summary,
        nextAction: code.next_step,
        citations: code.citations,
        confidence: code.confidence,
      }
    }
    case 'rubric_feedback': {
      const feedback = artifact
      return {
        kind: 'submission_checklist',
        title: 'Submission checklist',
        summary: feedback.summary,
        body: feedback.feedback,
        checklist: feedback.rubric_criteria,
        citations: feedback.citations,
        confidence: feedback.confidence,
      }
    }
    case 'safety_refusal': {
      const refusal = artifact
      return {
        kind: 'refusal',
        title: 'AI cannot help with that request',
        summary: refusal.reason,
        body: refusal.recovery,
        citations: refusal.citations,
        confidence: refusal.confidence,
      }
    }
    case 'authoring_patch':
    case 'teacher_intervention': {
      return {
        kind: 'refusal',
        title: 'Student action unavailable',
        summary: artifact.summary,
        body: 'This output belongs to authoring workflows, not student study mode.',
        citations: artifact.citations,
        confidence: artifact.confidence,
      }
    }
  }
}

export function composeStudentAiPrompt({
  modePrompt,
  selectionText,
  userInput,
}: {
  modePrompt: string
  selectionText: string
  userInput: string
}) {
  const parts = [modePrompt]
  if (selectionText) {
    parts.push(`Use this selected text as the focus:\n${selectionText}`)
  }
  if (userInput.trim()) {
    parts.push(`Student request:\n${userInput.trim()}`)
  }
  parts.push('Return a concise learning response. Keep assessment boundaries intact.')
  return parts.join('\n\n')
}
