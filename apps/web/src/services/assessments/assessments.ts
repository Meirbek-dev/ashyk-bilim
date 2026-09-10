'use server'

import { getAssessment, getActivityAssessment } from '@/lib/api/generated/assessments/assessments'
import type { AssessmentDetail } from '@/lib/api/generated/zod'

export interface AssessmentSummary {
  id: string
  assessment_uuid: string
  activity_id: string
  activity_uuid: string
  course_id: string | null
  course_uuid: string | null
  chapter_id: number
  kind: 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ'
  title: string
  description: string
  lifecycle: string
  scheduled_at?: string | null
  published_at?: string | null
  archived_at?: string | null
}

export interface AssessmentMutationPayload {
  title: string
  description?: string
  course_id?: number
  chapter_id?: number
  grading_type?: 'NUMERIC' | 'PERCENTAGE'
  due_at?: string | null
}

const KIND_FROM_WIRE: Record<AssessmentDetail['kind'], AssessmentSummary['kind']> = {
  exam: 'EXAM',
  code_challenge: 'CODE_CHALLENGE',
  quiz: 'QUIZ',
}

function summaryFromWire(assessment: AssessmentDetail): AssessmentSummary {
  return {
    id: assessment.id,
    assessment_uuid: assessment.id,
    activity_id: assessment.activity_id,
    activity_uuid: assessment.activity_id,
    course_id: assessment.course_id,
    course_uuid: assessment.course_id,
    chapter_id: 0,
    kind: KIND_FROM_WIRE[assessment.kind],
    title: assessment.title,
    description: assessment.description,
    lifecycle: assessment.lifecycle,
    scheduled_at: assessment.scheduled_at_unix != null ? new Date(assessment.scheduled_at_unix * 1000).toISOString() : null,
    published_at: assessment.published_at_unix != null ? new Date(assessment.published_at_unix * 1000).toISOString() : null,
    archived_at: assessment.archived_at_unix != null ? new Date(assessment.archived_at_unix * 1000).toISOString() : null,
  }
}

/**
 * Server-side: fetch an assessment by its id.
 * Returns null on 404 rather than throwing.
 */
export async function getAssessmentByUuid(assessmentUuid: string): Promise<AssessmentSummary | null> {
  try {
    return summaryFromWire(await getAssessment(assessmentUuid))
  } catch {
    return null
  }
}

/**
 * Server-side: fetch an assessment by its activity id.
 * Returns null on 404 rather than throwing.
 */
export async function getAssessmentByActivityUuid(activityUuid: string): Promise<AssessmentSummary | null> {
  try {
    return summaryFromWire(await getActivityAssessment(activityUuid))
  } catch {
    return null
  }
}
