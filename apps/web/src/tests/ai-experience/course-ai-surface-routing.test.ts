import { describe, expect, it } from 'vitest'

import { resolveCourseAISurfaceRoute } from '@/features/course-qa/components/course-ai-hub'
import type { ActivityAIMode, AIScope } from '@/features/ai-experience'

const surfaces: AIScope['surface'][] = ['student-activity', 'teacher-studio', 'teacher-review', 'course-page', 'admin']
const modes: ActivityAIMode[] = [
  'ask',
  'explain',
  'practice',
  'sources',
  'review',
  'analyze',
  'draft-feedback',
  'remediation',
]

describe('course AI surface routing', () => {
  it('maps every mode and surface without a fallback to an unrelated job', () => {
    for (const surface of surfaces) {
      for (const mode of modes) {
        const route = resolveCourseAISurfaceRoute(mode, surface)
        expect(['chat', 'course-review', 'unavailable']).toContain(route)
        if (route === 'course-review') {
          expect(surface).toBe('course-page')
          expect(mode).toBe('analyze')
        }
      }
    }
  })

  it('keeps workflow actions unavailable as global panel destinations', () => {
    expect(resolveCourseAISurfaceRoute('draft-feedback', 'teacher-review')).toBe('unavailable')
    expect(resolveCourseAISurfaceRoute('remediation', 'teacher-review')).toBe('unavailable')
    expect(resolveCourseAISurfaceRoute('sources', 'student-activity')).toBe('unavailable')
  })
})
