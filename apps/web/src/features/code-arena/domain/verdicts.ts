import type { CodeVerdict, TestCaseResult } from './codeChallenge.types'

// BUG-373: verdicts come from exact codes, never substrings ('RUNTIME'.includes('TIME')).
/** Server `CodeRunStatus` (upper-cased by the service layer) → verdict. */
const RUN_STATUS_VERDICT: Record<string, CodeVerdict> = {
  QUEUED: 'RUNNING',
  RUNNING: 'RUNNING',
  ACCEPTED: 'ACCEPTED',
  WRONG_ANSWER: 'WRONG_ANSWER',
  COMPILE_ERROR: 'COMPILE_ERROR',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  TIME_LIMIT: 'TIME_LIMIT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DEGRADED: 'DEGRADED',
}

export function verdictFromRun(status: string | undefined, passed: number, total: number): CodeVerdict {
  if (!status) return 'IDLE'
  const verdict = RUN_STATUS_VERDICT[status.toUpperCase()] ?? 'INTERNAL_ERROR'
  return verdict === 'ACCEPTED' && total > 0 && passed < total ? 'WRONG_ANSWER' : verdict
}

/** One case's verdict from its Judge0 status id (the server rewrites a mismatched output to 4). */
export function caseVerdict(result: Pick<TestCaseResult, 'passed' | 'status_id'>): CodeVerdict {
  const id = result.status_id
  if (id === null || id === undefined) return result.passed ? 'ACCEPTED' : 'WRONG_ANSWER'
  if (id === 1 || id === 2) return 'RUNNING'
  if (id === 3) return 'ACCEPTED'
  if (id === 4) return 'WRONG_ANSWER'
  if (id === 5) return 'TIME_LIMIT'
  if (id === 6) return 'COMPILE_ERROR'
  if (id >= 7 && id <= 12) return 'RUNTIME_ERROR'
  return 'INTERNAL_ERROR'
}

export function verdictFromResults(results: TestCaseResult[] | null): CodeVerdict | null {
  if (!results) return null
  if (results.length === 0) return 'IDLE'
  const firstFailed = results.find(result => !result.passed)
  return firstFailed ? caseVerdict(firstFailed) : 'ACCEPTED'
}

/** Catalog key under `Activities.CodeChallenges` (UX-286: labels are localized). */
export function verdictLabelKey(verdict: CodeVerdict | null): string {
  switch (verdict) {
    case 'ACCEPTED': {
      return 'status.accepted'
    }
    case 'WRONG_ANSWER': {
      return 'status.wrongAnswer'
    }
    case 'COMPILE_ERROR': {
      return 'status.compilationError'
    }
    case 'RUNTIME_ERROR': {
      return 'status.runtimeError'
    }
    case 'TIME_LIMIT': {
      return 'status.timeLimitExceeded'
    }
    case 'INTERNAL_ERROR': {
      return 'status.internalError'
    }
    case 'DEGRADED': {
      return 'status.runnerUnavailable'
    }
    case 'RUNNING': {
      return 'status.running'
    }
    default: {
      return 'status.ready'
    }
  }
}

export function verdictTone(verdict: CodeVerdict | null): 'success' | 'destructive' | 'warning' | 'secondary' {
  switch (verdict) {
    case 'ACCEPTED': {
      return 'success'
    }
    case 'WRONG_ANSWER':
    case 'RUNTIME_ERROR': {
      return 'destructive'
    }
    case 'COMPILE_ERROR':
    case 'TIME_LIMIT':
    case 'INTERNAL_ERROR':
    case 'DEGRADED': {
      return 'warning'
    }
    default: {
      return 'secondary'
    }
  }
}

export function firstFailingResult(results: TestCaseResult[] | null): TestCaseResult | null {
  return results?.find(result => !result.passed) ?? null
}
