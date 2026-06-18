export interface AssessmentRewriteRolloutInput {
  courseUuid: string
  env?: AssessmentRewriteEnv
}

interface AssessmentRewriteEnv {
  NEXT_PUBLIC_ASSESSMENT_REWRITE?: string | undefined
  NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES?: string | undefined
}

export function isAssessmentRewriteEnabled({ courseUuid, env }: AssessmentRewriteRolloutInput): boolean {
  const rolloutEnv = env ?? readPublicAssessmentRewriteEnv()
  const mode = normalizeMode(rolloutEnv.NEXT_PUBLIC_ASSESSMENT_REWRITE)
  if (mode === 'off') return false
  if (mode === 'course-allowlist') {
    return parseCourseAllowlist(rolloutEnv.NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES).has(normalizeCourseUuid(courseUuid))
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

function readPublicAssessmentRewriteEnv(): AssessmentRewriteEnv {
  return {
    NEXT_PUBLIC_ASSESSMENT_REWRITE: process.env.NEXT_PUBLIC_ASSESSMENT_REWRITE,
    NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES: process.env.NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES,
  }
}
