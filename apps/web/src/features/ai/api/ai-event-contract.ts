export type AiIntent =
  | 'freeform'
  | 'tutor_answer'
  | 'flashcards'
  | 'hint_ladder'
  | 'code_review_hint'
  | 'authoring_patch'
  | 'rubric_feedback'
  | 'teacher_intervention'

export type AiArtifactKind =
  | 'tutor_answer'
  | 'flashcard_set'
  | 'hint_ladder'
  | 'code_review_hint'
  | 'authoring_patch'
  | 'rubric_feedback'
  | 'teacher_intervention'
  | 'safety_refusal'

export interface EvidenceCitation {
  id: string
  label: string
  source_type: 'course' | 'activity' | 'submission' | 'rubric' | 'system' | 'unknown'
  excerpt: string
  score?: number | null
}

export interface AiArtifactBase {
  kind: AiArtifactKind
  summary: string
  citations: EvidenceCitation[]
  confidence: number
  policy_notes: string[]
  next_actions: string[]
}

export interface TutorAnswerArtifact extends AiArtifactBase {
  kind: 'tutor_answer'
  content: string
}

export interface Flashcard {
  front: string
  back: string
  difficulty: 'intro' | 'practice' | 'challenge'
  citation_ids: string[]
}

export interface FlashcardSetArtifact extends AiArtifactBase {
  kind: 'flashcard_set'
  cards: Flashcard[]
}

export interface HintStep {
  level: number
  title: string
  hint: string
  reveals_solution: boolean
  citation_ids: string[]
}

export interface HintLadderArtifact extends AiArtifactBase {
  kind: 'hint_ladder'
  steps: HintStep[]
}

export interface CodeReviewHintArtifact extends AiArtifactBase {
  kind: 'code_review_hint'
  issue: string
  next_step: string
  related_test?: string | null
  reveals_solution: boolean
}

export interface AuthoringPatchArtifact extends AiArtifactBase {
  kind: 'authoring_patch'
  patch_markdown: string
  changed_blocks: string[]
  risk_labels: string[]
}

export interface RubricFeedbackArtifact extends AiArtifactBase {
  kind: 'rubric_feedback'
  feedback: string
  rubric_criteria: string[]
}

export interface TeacherInterventionArtifact extends AiArtifactBase {
  kind: 'teacher_intervention'
  cohort_summary: string
  intervention_draft: string
  privacy_notes: string[]
}

export interface SafetyRefusalArtifact extends AiArtifactBase {
  kind: 'safety_refusal'
  reason: string
  recovery: string
}

export type AiArtifact =
  | TutorAnswerArtifact
  | FlashcardSetArtifact
  | HintLadderArtifact
  | CodeReviewHintArtifact
  | AuthoringPatchArtifact
  | RubricFeedbackArtifact
  | TeacherInterventionArtifact
  | SafetyRefusalArtifact

export type AiStreamEventType =
  | 'run.started'
  | 'status.changed'
  | 'tool.started'
  | 'tool.delta'
  | 'tool.finished'
  | 'artifact.delta'
  | 'message.delta'
  | 'citation.added'
  | 'run.finished'
  | 'run.error'
  | 'run.aborted'

export interface AiStreamEventBase<TType extends AiStreamEventType = AiStreamEventType> {
  version: 2
  type: TType
  event_id: string
  run_id: string
  thread_id: string
  sequence: number
  timestamp: string
  payload?: unknown
}

export interface RunStartedEvent extends AiStreamEventBase<'run.started'> {
  payload?: Record<string, unknown>
}

export interface StatusChangedEvent extends AiStreamEventBase<'status.changed'> {
  payload: {
    status: string
    message: string
  }
}

export interface ToolProgressEvent extends AiStreamEventBase<'tool.started' | 'tool.delta' | 'tool.finished'> {
  type: 'tool.started' | 'tool.delta' | 'tool.finished'
  payload: {
    tool_name: string
    label: string
    status: 'pending' | 'running' | 'complete' | 'error'
    detail?: string | null
  }
}

export interface ArtifactDeltaEvent extends AiStreamEventBase<'artifact.delta'> {
  payload: {
    artifact: AiArtifact
    final: boolean
  }
}

export interface CitationAddedEvent extends AiStreamEventBase<'citation.added'> {
  payload: {
    citation: EvidenceCitation
  }
}

export interface RunErrorEvent extends AiStreamEventBase<'run.error'> {
  payload: {
    message: string
    code: string
    recoverable: boolean
    details: Record<string, unknown>
  }
}

export interface RunFinishedEvent extends AiStreamEventBase<'run.finished'> {
  payload?: Record<string, unknown>
}

export interface RunAbortedEvent extends AiStreamEventBase<'run.aborted'> {
  payload?: Record<string, unknown>
}

export interface MessageDeltaEvent extends AiStreamEventBase<'message.delta'> {
  payload?: Record<string, unknown>
}

export type AiStreamEvent =
  | RunStartedEvent
  | StatusChangedEvent
  | ToolProgressEvent
  | ArtifactDeltaEvent
  | CitationAddedEvent
  | MessageDeltaEvent
  | RunErrorEvent
  | RunFinishedEvent
  | RunAbortedEvent

const eventTypes = new Set<AiStreamEventType>([
  'run.started',
  'status.changed',
  'tool.started',
  'tool.delta',
  'tool.finished',
  'artifact.delta',
  'message.delta',
  'citation.added',
  'run.finished',
  'run.error',
  'run.aborted',
])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function isAiStreamEvent(value: unknown): value is AiStreamEvent {
  if (!isRecord(value)) return false
  return value.version === 2 && typeof value.type === 'string' && eventTypes.has(value.type as AiStreamEventType)
}

export function readAiStreamEventChunk(chunk: unknown): AiStreamEvent | null {
  if (!isRecord(chunk) || chunk.type !== 'CUSTOM') return null
  return isAiStreamEvent(chunk.value) ? chunk.value : null
}
