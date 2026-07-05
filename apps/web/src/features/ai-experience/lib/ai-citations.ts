export interface AICitation {
  citation_id: string
  label: string
  source_type: string
  source_uuid?: string | null
  excerpt: string
  confidence?: number | null
}

export function citationHref(citation: AICitation, options: { courseUuid?: string | null | undefined } = {}) {
  if (!citation.source_uuid) return undefined
  if (citation.source_type === 'activity') {
    const cleanActivityUuid = citation.source_uuid.replace(/^activity_/, '')
    const cleanCourseUuid = options.courseUuid?.replace(/^course_/, '')
    return cleanCourseUuid
      ? `/course/${cleanCourseUuid}/activity/${cleanActivityUuid}`
      : `#activity-${citation.source_uuid}`
  }
  if (citation.source_type === 'assessment') return `#assessment-${citation.source_uuid}`
  if (citation.source_type === 'submission') return `#submission-${citation.source_uuid}`
  return `#source-${citation.source_uuid}`
}

export function confidenceLabel(value?: number | null) {
  if (typeof value !== 'number') return 'Uncalibrated'
  if (value >= 0.8) return 'High confidence'
  if (value >= 0.55) return 'Medium confidence'
  return 'Low confidence'
}
