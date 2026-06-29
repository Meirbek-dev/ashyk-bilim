import type { CodeVerdict, TestCaseResult } from './codeChallenge.types'

export function verdictFromRun(status: string | undefined, passed: number, total: number): CodeVerdict {
  const normalized = (status ?? '').toUpperCase()
  if (!normalized) return 'IDLE'
  if (normalized === 'DEGRADED') return 'DEGRADED'
  if (normalized.includes('COMPILE')) return 'COMPILE_ERROR'
  if (normalized.includes('TIME')) return 'TIME_LIMIT'
  if (normalized.includes('RUNTIME')) return 'RUNTIME_ERROR'
  if (normalized.includes('RUN') || normalized.includes('QUEUE') || normalized.includes('PROCESS')) return 'RUNNING'
  if (total > 0 && passed >= total) return 'ACCEPTED'
  if (normalized.includes('ACCEPTED') && passed >= total) return 'ACCEPTED'
  return 'WRONG_ANSWER'
}

export function verdictFromResults(results: TestCaseResult[] | null): CodeVerdict | null {
  if (!results) return null
  if (results.length === 0) return 'IDLE'
  if (results.every(result => result.passed)) return 'ACCEPTED'
  const firstFailed = results.find(result => !result.passed)
  const status = (firstFailed?.status_description ?? '').toUpperCase()
  if (status.includes('COMPILE')) return 'COMPILE_ERROR'
  if (status.includes('TIME')) return 'TIME_LIMIT'
  if (status.includes('RUNTIME')) return 'RUNTIME_ERROR'
  return 'WRONG_ANSWER'
}

export function verdictLabel(verdict: CodeVerdict | null): string {
  switch (verdict) {
    case 'ACCEPTED': {
      return 'Accepted'
    }
    case 'WRONG_ANSWER': {
      return 'Wrong Answer'
    }
    case 'COMPILE_ERROR': {
      return 'Compile Error'
    }
    case 'RUNTIME_ERROR': {
      return 'Runtime Error'
    }
    case 'TIME_LIMIT': {
      return 'Time Limit'
    }
    case 'DEGRADED': {
      return 'Runner Unavailable'
    }
    case 'RUNNING': {
      return 'Running'
    }
    case 'IDLE':
    case null: {
      return 'Ready'
    }
    default: {
      return 'Ready'
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
