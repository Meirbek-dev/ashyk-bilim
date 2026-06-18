import { describe, expect, it } from 'vite-plus/test'

import { isAssessmentRewriteEnabled, parseCourseAllowlist } from '@/features/assessments/studio/rollout'

describe('assessment rewrite rollout', () => {
  it('defaults the rewritten studio on', () => {
    expect(isAssessmentRewriteEnabled({ courseUuid: 'course_math' })).toBe(true)
  })

  it('supports environment-level disable', () => {
    expect(
      isAssessmentRewriteEnabled({
        courseUuid: 'course_math',
        env: { NEXT_PUBLIC_ASSESSMENT_REWRITE: 'off' },
      }),
    ).toBe(false)
  })

  it('supports course allowlists with normalized course ids', () => {
    expect(parseCourseAllowlist('course_math, physics')).toEqual(new Set(['math', 'physics']))
    expect(
      isAssessmentRewriteEnabled({
        courseUuid: 'course_math',
        env: {
          NEXT_PUBLIC_ASSESSMENT_REWRITE: 'course-allowlist',
          NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES: 'math,science',
        },
      }),
    ).toBe(true)
    expect(
      isAssessmentRewriteEnabled({
        courseUuid: 'history',
        env: {
          NEXT_PUBLIC_ASSESSMENT_REWRITE: 'course-allowlist',
          NEXT_PUBLIC_ASSESSMENT_REWRITE_COURSES: 'math,science',
        },
      }),
    ).toBe(false)
  })
})
