import type { UIMessage } from '@tanstack/ai-react'
import type { LucideIcon } from 'lucide-react'
import type { AiArtifact, AiIntent, EvidenceCitation } from '@/features/ai'

export type StudentAiAvailabilityState = 'enabled' | 'restricted' | 'disabled'

export type StudentAiMode = 'understand' | 'practice' | 'hint' | 'debug' | 'submit' | 'reflect'

export type StudentAiRunState = 'idle' | 'preparing' | 'streaming' | 'complete' | 'failed' | 'cancelled'

export interface StudentAiModeConfig {
  id: StudentAiMode
  label: string
  shortLabel: string
  description: string
  prompt: string
  intent: AiIntent
  icon: LucideIcon
}

export interface StudentAiContextItem {
  id: string
  label: string
  detail: string
  state: 'active' | 'available' | 'restricted'
}

export interface StudentAiSafetyState {
  level: 'permitted' | 'limited' | 'blocked'
  title: string
  description: string
}

export interface StudentAiAvailability {
  state: StudentAiAvailabilityState
  reason: string
  modes: StudentAiModeConfig[]
  context: StudentAiContextItem[]
  safety: StudentAiSafetyState
}

export interface StudentAiSelection {
  text: string
  source: 'selection' | 'activity'
}

export type StudentAiOutputKind =
  | 'empty'
  | 'loading'
  | 'explanation'
  | 'practice_set'
  | 'hint_ladder'
  | 'code_diagnosis'
  | 'submission_checklist'
  | 'reflection'
  | 'refusal'

export interface StudentAiPracticeItem {
  id: string
  prompt: string
  answer: string
}

export interface StudentAiHintStep {
  id: string
  title: string
  hint: string
  revealsSolution: boolean
}

export interface StudentAiOutput {
  kind: StudentAiOutputKind
  title: string
  summary: string
  body?: string
  nextAction?: string
  practiceItems?: StudentAiPracticeItem[]
  hintSteps?: StudentAiHintStep[]
  checklist?: string[]
  citations: EvidenceCitation[]
  confidence?: number | null
}

export interface StudentAiSession {
  messages: UIMessage[]
  selectedMode: StudentAiMode
  setSelectedMode: (mode: StudentAiMode) => void
  input: string
  setInput: (value: string) => void
  runState: StudentAiRunState
  statusMessage: string | null
  output: StudentAiOutput
  submit: (message?: string) => void
  stop: () => void
  reset: () => void
  copyOutput: () => Promise<void>
  saveOutput: () => void
  reportOutput: () => void
  latestArtifact: AiArtifact | null
}
