'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CourseStatusBadge, courseWorkflowCardClass, courseWorkflowSummaryCardClass } from './courseWorkflowUi'
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { useCourse } from '@components/Contexts/CourseContext'
import { InlineError } from '@/components/ui/error-state'
import { getAbsoluteUrl } from '@services/config/config'
import { getCourseReadiness } from '@services/courses/courses'
import type { CourseReadiness } from '@services/courses/courses'
import { useCourseEditorStore } from '@/stores/courses'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'

export default function CourseReviewPublish({
  courseuuid,
  capabilities,
}: {
  courseuuid: string
  capabilities: CourseWorkspaceCapabilities
}) {
  const t = useTranslations('DashPage.CourseManagement.Review')
  const course = useCourse()
  const { updateAccess } = useCoursesMutations(course.courseStructure.course_uuid, true)
  const setConflict = useCourseEditorStore(state => state.setConflict)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const readinessQuery = useQuery(
    queryOptions({
      queryKey: ['courses', course.courseStructure.course_uuid, 'readiness'],
      queryFn: () => getCourseReadiness(course.courseStructure.course_uuid),
    }),
  )
  const readiness = readinessQuery.data
  const blockers = readiness?.issues.filter(issue => issue.severity === 'blocker') ?? []
  const warnings = readiness?.issues.filter(issue => issue.severity === 'warning') ?? []
  const isPublic = course.courseStructure.public

  const toggleVisibility = () => {
    if (!capabilities.canManageAccess) return
    const nextPublic = !isPublic

    startTransition(() => {
      void (async () => {
        try {
          setIsRefreshing(true)
          await updateAccess({ public: nextPublic }, { lastKnownUpdateDate: course.courseStructure.update_date })
          await readinessQuery.refetch()
          toast.success(isPublic ? t('toasts.movedPrivate') : t('toasts.published'))
        } catch (error: unknown) {
          const apiError = error as AppApiError
          await readinessQuery.refetch()
          if (apiError.status === 409) {
            setConflict({
              serverVersion: course.courseStructure,
              message: String(apiError.detail || apiError.message || ''),
              pendingSave: async () => {
                await updateAccess({ public: nextPublic }, { lastKnownUpdateDate: course.courseStructure.update_date })
              },
            })
            return
          }
          toast.error(apiError.message || t('errors.visibilityUpdate'))
        } finally {
          setIsRefreshing(false)
        }
      })()
    })
  }

  const publishDisabled = !isPublic && (!readiness?.ready || readinessQuery.isLoading || readinessQuery.isError)

  return (
    <div className="flex flex-col gap-6">
      <section className={`${courseWorkflowCardClass} p-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance">
              {isPublic ? t('publishedTitle') : readiness?.ready ? t('readyTitle') : t('notReadyTitle')}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 text-pretty">{t('description')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={`${getAbsoluteUrl(`/course/${courseuuid}`)}?preview=learner`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('openLearnerPreview')}
                />
              }
            >
              <Eye data-icon="inline-start" aria-hidden />
              {t('openLearnerPreview')}
            </Button>
            {capabilities.canManageAccess ? (
              <Button onClick={toggleVisibility} disabled={isPending || isRefreshing || publishDisabled}>
                {isPending || isRefreshing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                {isPublic ? t('movePrivate') : t('publishCourse')}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`${courseWorkflowCardClass} p-5`} aria-labelledby="course-readiness-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="course-readiness-title" className="text-foreground font-semibold">
              {t('serverReadinessTitle')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('serverReadinessDescription')}</p>
          </div>
          <CourseStatusBadge status={readiness?.ready ? 'ready' : 'needs-review'} />
        </div>

        {readinessQuery.isError ? (
          <InlineError className="mt-4" description={t('readinessUnavailable')} />
        ) : readinessQuery.isLoading ? (
          <div className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
            <Loader2 className="animate-spin" aria-hidden />
            {t('loadingReadiness')}
          </div>
        ) : readiness ? (
          <ReadinessIssues readiness={readiness} />
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Alert>
          <Eye aria-hidden />
          <AlertTitle>{t('previewTitle')}</AlertTitle>
          <AlertDescription>{t('previewHonesty')}</AlertDescription>
        </Alert>

        <aside className={courseWorkflowSummaryCardClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t('publishImpact')}</h2>
            <CourseStatusBadge status={isPublic ? 'live' : 'private'} />
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <ImpactRow label={t('activeContent')} value={String(readiness?.active_content_count ?? 0)} />
            <ImpactRow label={t('scheduledContent')} value={String(readiness?.scheduled_content_count ?? 0)} />
            <ImpactRow label={t('openBlockers')} value={String(blockers.length)} />
            <ImpactRow label={t('warnings')} value={String(warnings.length)} />
          </dl>
        </aside>
      </div>
    </div>
  )
}

function ReadinessIssues({ readiness }: { readiness: CourseReadiness }) {
  const t = useTranslations('DashPage.CourseManagement.Review')
  const issueMessage = (code: string, fallback: string): string => {
    const messages: Record<string, string> = {
      COURSE_NO_LEARNER_VISIBLE_ACTIVITIES: t('issues.noVisibleActivities'),
      COURSE_REQUIRED_ACTIVITY_UNPUBLISHED: t('issues.requiredActivityUnpublished'),
      COURSE_ASSESSMENT_UNREADY: t('issues.assessmentUnready'),
      COURSE_FILE_SUBMISSION_UNREADY: t('issues.fileSubmissionUnready'),
      COURSE_THUMBNAIL_MISSING: t('issues.thumbnailMissing'),
      COURSE_OUTCOMES_MISSING: t('issues.outcomesMissing'),
      COURSE_CERTIFICATE_NOT_CONFIGURED: t('issues.certificateMissing'),
      COURSE_CONTRIBUTOR_NOT_CONFIGURED: t('issues.contributorMissing'),
    }
    return messages[code] ?? fallback
  }
  if (readiness.issues.length === 0) {
    return (
      <Alert className="mt-4">
        <CheckCircle2 aria-hidden />
        <AlertTitle>{t('noBlockersTitle')}</AlertTitle>
        <AlertDescription>{t('noBlockersDescription')}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {readiness.issues.map(issue => (
        <Alert
          key={`${issue.code}-${issue.activity_uuid ?? issue.scope}`}
          variant={issue.severity === 'blocker' ? 'destructive' : 'default'}
        >
          {issue.severity === 'blocker' ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}
          <AlertTitle>{issue.severity === 'blocker' ? t('blockerLabel') : t('warningLabel')}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{issueMessage(issue.code, issue.message)}</span>
            {issue.path ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<AppLink href={issue.path} />}>
                {t('resolveIssue')}
                <ExternalLink data-icon="inline-end" aria-hidden />
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

function ImpactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
