import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'

import { redirect as redirectWithLocale } from '@/i18n/navigation'
import { APP_NAME } from '@/lib/constants'

import { getSession } from '@/lib/auth/session'
import { getSearchParam } from '@/lib/search-params'
import type { PageSearchParams } from '@/lib/search-params'
import { getAssessmentByUuid } from '@services/assessments/assessments'

interface Props {
  params: Promise<{ assessmentUuid: string }>
  searchParams: Promise<PageSearchParams>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { assessmentUuid } = await props.params
  const assessment = await getAssessmentByUuid(assessmentUuid)
  if (!assessment) {
    const t = await getTranslations('NotFoundPage')
    return { title: `${t('title')} - ${APP_NAME}`, robots: { index: false } }
  }
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
 *  - Teacher (review param): /dash/courses/{courseUuid}/activity/{activityUuid}/review?submission={submissionUuid}
 * Fallback (no course): notFound()
 *
 * The session read and the fetch run inside the page's own `<Suspense>`
 * (UX-243, the /dash e1b8539 pattern).
 */
export default function AssessmentAttemptPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <AssessmentForward {...props} />
    </Suspense>
  )
}

async function AssessmentForward(props: Props) {
  const [{ assessmentUuid }, searchParams, initialSession, locale] = await Promise.all([
    props.params,
    props.searchParams,
    getSession(),
    getLocale(),
  ])
  const reviewSubmissionUuid = getSearchParam(searchParams, 'review') ?? null

  // Session first: anonymously the assessment is a 401 (→ null), which must
  // not turn a login deep link into «not found» (UX-229).
  if (!initialSession) {
    const returnTo = reviewSubmissionUuid
      ? `/assessments/${assessmentUuid}?review=${encodeURIComponent(reviewSubmissionUuid)}`
      : `/assessments/${assessmentUuid}`
    return redirectWithLocale({ href: `/login?returnTo=${encodeURIComponent(returnTo)}`, locale })
  }

  const assessment = await getAssessmentByUuid(assessmentUuid)
  if (!assessment) notFound()

  // Redirect to canonical URL when course context is available — locale-aware,
  // so there is no extra 307 through the locale middleware (UX-243).
  if (assessment.course_uuid && assessment.activity_uuid) {
    const cleanCourse = assessment.course_uuid.replace(/^course_/, '')
    const cleanActivity = assessment.activity_uuid.replace(/^activity_/, '')

    // Teacher review deep-link: ?review={submissionUuid} → the grading review page
    if (reviewSubmissionUuid) {
      const cleanSubmission = reviewSubmissionUuid.replace(/^submission_/, '')
      return redirectWithLocale({
        href: `/dash/courses/${cleanCourse}/activity/${cleanActivity}/review?submission=${cleanSubmission}`,
        locale,
      })
    }

    return redirectWithLocale({ href: `/course/${cleanCourse}/activity/${cleanActivity}`, locale })
  }

  // No course context — render a minimal standalone shell (future: teacher preview)
  notFound()
}
