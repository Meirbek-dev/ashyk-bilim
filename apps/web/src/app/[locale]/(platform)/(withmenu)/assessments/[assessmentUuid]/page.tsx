import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { getSession } from '@/lib/auth/session'
import { getSearchParam, type PageSearchParams } from '@/lib/search-params'
import { getAssessmentByUuid } from '@services/assessments/assessments'

interface Props {
  params: Promise<{ assessmentUuid: string }>
  searchParams: Promise<PageSearchParams>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { assessmentUuid } = await props.params
  const assessment = await getAssessmentByUuid(assessmentUuid)
  if (!assessment) return { title: 'Assessment not found' }
  return { title: assessment.title, robots: { index: false } }
}

/**
 * Standalone /assessments/:uuid route — redirects to the canonical activity
 * URL so the student stays within the course context.
 *
 * The inline InlineAssessmentWorkspace on the activity page handles the actual
 * attempt UI; this route exists only for backward-compatible deep-links.
 *
 * Redirect target:
 *  - Student: /course/{courseUuid}/activity/{activityUuid}
 *  - Teacher (review param): /editor/course/{courseUuid}/activity/{activityUuid}?tab=review&submission={submissionUuid}
 * Fallback (no course): notFound()
 */
export default async function AssessmentAttemptPage(props: Props) {
  const { assessmentUuid } = await props.params
  const searchParams = await props.searchParams
  const reviewSubmissionUuid = getSearchParam(searchParams, 'review') ?? null

  const [assessment, initialSession] = await Promise.all([
    getAssessmentByUuid(assessmentUuid),
    getSession(),
  ])

  if (!assessment) notFound()

  if (!initialSession) {
    const callbackUrl = reviewSubmissionUuid
      ? `/assessments/${assessmentUuid}?review=${reviewSubmissionUuid}`
      : `/assessments/${assessmentUuid}`
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  }

  // Redirect to canonical URL when course context is available
  if (assessment.course_uuid && assessment.activity_uuid) {
    const cleanCourse = assessment.course_uuid.replace(/^course_/, '')
    const cleanActivity = assessment.activity_uuid.replace(/^activity_/, '')

    // Teacher review deep-link: ?review={submissionUuid} → editor review tab
    if (reviewSubmissionUuid) {
      const cleanSubmission = reviewSubmissionUuid.replace(/^submission_/, '')
      redirect(
        `/editor/course/${cleanCourse}/activity/${cleanActivity}?tab=review&submission=${cleanSubmission}`,
      )
    }

    redirect(`/course/${cleanCourse}/activity/${cleanActivity}`)
  }

  // No course context — render a minimal standalone shell (future: teacher preview)
  notFound()
}
