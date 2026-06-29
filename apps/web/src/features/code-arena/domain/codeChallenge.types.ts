import type { ItemAnswer } from '@/features/assessments/domain/items'
import type {
  CodeChallengeSettings,
  CodeSubmission,
  Judge0Language,
  TestCaseResult,
} from '@/services/courses/code-challenges'

export type CodeArenaTab = 'description' | 'hints' | 'submissions'
export type CodeResultTab = 'testcase' | 'result' | 'console'

export interface CodeChallengeProblem {
  activityUuid: string
  itemUuid?: string
  title: string
  prompt: string
  inputSpec: string
  outputSpec: string
  constraints: string[]
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD'
  points?: number
  timeLimitSeconds?: number
  memoryLimitMb?: number
}

export interface CodeArenaState {
  code: string
  languageId: number
  customInput: string
  consoleOutput: string
  runResults: TestCaseResult[] | null
  verdict: CodeVerdict | null
  activeResultTab: CodeResultTab
}

export type CodeVerdict =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'COMPILE_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT'
  | 'DEGRADED'
  | 'RUNNING'
  | 'IDLE'

export interface CodeArenaSubmitControl {
  canSubmit: boolean
  isSubmitting: boolean
  submit: () => Promise<void> | void
}

export type CodeAnswer = Extract<ItemAnswer, { kind: 'CODE' }>

export type { CodeChallengeSettings, CodeSubmission, Judge0Language, TestCaseResult }
