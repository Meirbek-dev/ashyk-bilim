export interface AssessmentRewriteRolloutInput {
  courseUuid: string
  env?: {
    NEXT_PUBLIC_ASSESSMENT_REWRITE?: string
    NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES?: string
  }
}

export function isAssessmentRewriteEnabled({ courseUuid, env = process.env }: AssessmentRewriteRolloutInput): boolean {
  const mode = normalizeMode(env.NEXT_PUBLIC_ASSESSMENT_REWRITE)
  if (mode === 'off') return false
  if (mode === 'course-allowlist') {
    return parseCourseAllowlist(env.NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES).has(normalizeCourseUuid(courseUuid))
  }
  return true
}

export function parseCourseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map(item => normalizeCourseUuid(item))
      .filter(Boolean),
  )
}

function normalizeMode(value: string | undefined): 'on' | 'off' | 'course-allowlist' {
  const normalized = (value ?? 'on').trim().toLowerCase()
  if (normalized === '0' || normalized === 'false' || normalized === 'off') return 'off'
  if (normalized === 'course-allowlist' || normalized === 'allowlist') return 'course-allowlist'
  return 'on'
}

function normalizeCourseUuid(value: string): string {
  return value.trim().replace(/^course_/, '')
}
