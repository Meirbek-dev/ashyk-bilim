'use client'

import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  LockKeyhole,
  PlayCircle,
  RotateCcw,
} from 'lucide-react'
import { useMemo } from 'react'
import type React from 'react'
import { useTranslations } from 'next-intl'

import AppLink from '@/components/ui/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineError } from '@/components/ui/error-state'
import { Progress } from '@/components/ui/progress'
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications'
import { LmsStatusBadge, LmsStatuses } from '@/features/lms-status'
import { cn } from '@/lib/utils'
import { getAbsoluteUrl } from '@services/config/config'

interface LearnerCourseModulesProps {
  course: AppCourse
  courseUuid: string
  isAuthenticated: boolean
  isEnrolled: boolean
  onStartCourse?: () => void
  starting?: boolean
  trailData?: AppTrailData | null | undefined
}

interface CourseActivityAgendaItem {
  activity: AppActivity
  chapterName: string
  cleanActivityUuid: string
  complete: boolean
  href: string
  index: number
  returned: boolean
}

interface CourseProgressSnapshot {
  completed: number
  items: CourseActivityAgendaItem[]
  nextItem: CourseActivityAgendaItem | null
  percent: number
  returnedItems: CourseActivityAgendaItem[]
  total: number
}

const LEARNER_COURSE_COPY = {
  agendaDescription: 'Next course actions in the order learners need them.',
  agendaLocked: 'The agenda unlocks when the course is started.',
  agendaTitle: 'Learner agenda',
  certificateCheckPending: 'Certificate check pending',
  certificateDescription: 'Complete every activity to unlock the certificate.',
  certificateDone: 'Done',
  certificateEarned: 'Certificate earned and ready to verify.',
  certificateProgress: 'Certificate progress',
  certificateRemaining: 'Remaining',
  completion: 'Completion',
  continue: 'Continue',
  feedbackDescription: 'Returned work stays visible until the learner opens the activity and revises it.',
  feedbackLockedDescription: 'Returned work and teacher feedback will be collected here once you submit course tasks.',
  feedbackLockedTitle: 'Feedback appears after enrollment',
  feedbackTitle: 'Feedback to review',
  inProgress: 'In progress',
  noActivitiesDescription: 'This course needs published activities before a learner agenda can be built.',
  noActivitiesTitle: 'No activities yet',
  noReturnedDescription: 'Teacher feedback that needs revision will appear here.',
  noReturnedTitle: 'No returned work',
  notEnrolled: 'Not enrolled',
  previewSyllabus: 'Preview syllabus',
  returned: 'Returned',
  returnedWork: 'Returned work',
  reviewFeedback: 'Review feedback and resubmit',
  signIn: 'Sign in',
  startCourse: 'Start course',
  untitledActivity: 'Untitled activity',
  verifyCertificate: 'Verify certificate',
}

export function LearnerCourseModules({
  course,
  courseUuid,
  isAuthenticated,
  isEnrolled,
  onStartCourse,
  starting,
  trailData,
}: LearnerCourseModulesProps) {
  const progress = useMemo(
    () => buildCourseProgressSnapshot(course, courseUuid, trailData),
    [course, courseUuid, trailData],
  )

  return (
    <div className="grid gap-4">
      <CourseEnrollmentState
        course={course}
        isAuthenticated={isAuthenticated}
        isEnrolled={isEnrolled}
        nextItem={progress.nextItem}
        onStartCourse={onStartCourse}
        starting={starting}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
        <LearnerAgendaModule isEnrolled={isEnrolled} progress={progress} />
        <CertificateProgressModule course={course} isEnrolled={isEnrolled} progress={progress} />
      </div>
      <ReturnedWorkModule isEnrolled={isEnrolled} returnedItems={progress.returnedItems} />
    </div>
  )
}

function CourseEnrollmentState({
  course,
  isAuthenticated,
  isEnrolled,
  nextItem,
  onStartCourse,
  starting,
}: {
  course: AppCourse
  isAuthenticated: boolean
  isEnrolled: boolean
  nextItem: CourseActivityAgendaItem | null
  onStartCourse?: (() => void) | undefined
  starting?: boolean | undefined
}) {
  const t = useTranslations('LearnerCourse')
  const status = isEnrolled ? LmsStatuses.IN_PROGRESS : isAuthenticated ? LmsStatuses.READY : LmsStatuses.LIMITED
  const title = isEnrolled ? 'You are enrolled' : isAuthenticated ? 'Preview before enrolling' : 'Sign in to start'
  const description = isEnrolled
    ? nextItem
      ? `Continue with ${nextItem.activity.name ?? 'the next activity'}.`
      : 'All listed activities are complete. Review the certificate module for completion status.'
    : 'See the syllabus and outcomes first. Starting the course creates your learner agenda and progress trail.'
  const firstActivity = firstCourseActivity(course)

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <LmsStatusBadge status={status} label={title} />
            {!course.public ? <Badge variant="outline">{t('privateCourse')}</Badge> : null}
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">{course.name}</h2>
            <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-52">
          {isEnrolled && nextItem ? (
            <Button className="w-full" nativeButton={false} render={<AppLink href={nextItem.href} />}>
              <PlayCircle data-icon="inline-start" aria-hidden="true" />
              {LEARNER_COURSE_COPY.continue}
            </Button>
          ) : (
            <Button className="w-full" disabled={starting} onClick={onStartCourse}>
              <PlayCircle data-icon="inline-start" aria-hidden="true" />
              {isAuthenticated ? LEARNER_COURSE_COPY.startCourse : LEARNER_COURSE_COPY.signIn}
            </Button>
          )}
          {!isEnrolled && firstActivity ? (
            <Button
              variant="outline"
              className="w-full"
              nativeButton={false}
              render={<AppLink href={firstActivity.href} />}
            >
              <BookOpenCheck data-icon="inline-start" aria-hidden="true" />
              {LEARNER_COURSE_COPY.previewSyllabus}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function LearnerAgendaModule({ isEnrolled, progress }: { isEnrolled: boolean; progress: CourseProgressSnapshot }) {
  const agendaItems = progress.items.filter(item => !item.complete).slice(0, 5)
  const visibleItems = agendaItems.length > 0 ? agendaItems : progress.items.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4" />
              {LEARNER_COURSE_COPY.agendaTitle}
            </CardTitle>
            <CardDescription>
              {isEnrolled ? LEARNER_COURSE_COPY.agendaDescription : LEARNER_COURSE_COPY.agendaLocked}
            </CardDescription>
          </div>
          <Badge variant="outline" className="tabular-nums">
            {progress.completed}/{progress.total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progress.percent} />
        {visibleItems.length === 0 ? (
          <EmptyModuleState
            icon={<AlertCircle className="size-5" />}
            title={LEARNER_COURSE_COPY.noActivitiesTitle}
            description={LEARNER_COURSE_COPY.noActivitiesDescription}
          />
        ) : (
          <div className="divide-border overflow-hidden rounded-lg border">
            {visibleItems.map(item => (
              <AppLink
                key={item.activity.activity_uuid}
                href={item.href}
                className="hover:bg-muted/40 flex min-h-14 items-center gap-3 px-3 py-2 transition-colors"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    item.complete
                      ? 'border-primary/20 bg-primary/10 text-primary'
                      : item.returned
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {item.complete ? <CheckCircle2 className="size-4" /> : item.index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.activity.name ?? LEARNER_COURSE_COPY.untitledActivity}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">{item.chapterName}</span>
                </span>
                {item.returned ? <Badge variant="destructive">{LEARNER_COURSE_COPY.returned}</Badge> : null}
                <ArrowRight className="text-muted-foreground size-4 shrink-0" />
              </AppLink>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReturnedWorkModule({
  isEnrolled,
  returnedItems,
}: {
  isEnrolled: boolean
  returnedItems: CourseActivityAgendaItem[]
}) {
  if (!isEnrolled) {
    return (
      <Card>
        <CardContent className="p-5">
          <EmptyModuleState
            icon={<LockKeyhole className="size-5" />}
            title={LEARNER_COURSE_COPY.feedbackLockedTitle}
            description={LEARNER_COURSE_COPY.feedbackLockedDescription}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="size-4" />
          {LEARNER_COURSE_COPY.feedbackTitle}
        </CardTitle>
        <CardDescription>{LEARNER_COURSE_COPY.feedbackDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {returnedItems.length === 0 ? (
          <EmptyModuleState
            icon={<CheckCircle2 className="size-5" />}
            title={LEARNER_COURSE_COPY.noReturnedTitle}
            description={LEARNER_COURSE_COPY.noReturnedDescription}
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {returnedItems.slice(0, 4).map(item => (
              <AppLink
                key={item.activity.activity_uuid}
                href={item.href}
                className="border-border hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-3 transition-colors"
              >
                <FileWarning className="text-destructive mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.activity.name ?? LEARNER_COURSE_COPY.returnedWork}
                  </span>
                  <span className="text-muted-foreground block text-xs">{LEARNER_COURSE_COPY.reviewFeedback}</span>
                </span>
                <ArrowRight className="text-muted-foreground size-4 shrink-0" />
              </AppLink>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CertificateProgressModule({
  course,
  isEnrolled,
  progress,
}: {
  course: AppCourse
  isEnrolled: boolean
  progress: CourseProgressSnapshot
}) {
  const normalizedCourseUuid = normalizeCourseUuid(course.course_uuid)
  const certificateQuery = useUserCertificateByCourse(
    isEnrolled && progress.percent === 100 ? normalizedCourseUuid : null,
  )
  const certificates = certificateQuery.isSuccess ? certificateQuery.data.data : []
  const earnedCertificate = certificates[0]
  const verificationHref = earnedCertificate
    ? getAbsoluteUrl(`/certificates/${earnedCertificate.certificate_user.user_certification_uuid}/verify`)
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="size-4" />
          {LEARNER_COURSE_COPY.certificateProgress}
        </CardTitle>
        <CardDescription>
          {earnedCertificate ? LEARNER_COURSE_COPY.certificateEarned : LEARNER_COURSE_COPY.certificateDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{LEARNER_COURSE_COPY.completion}</span>
            <span className="font-medium tabular-nums">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{LEARNER_COURSE_COPY.certificateDone}</div>
            <div className="text-xl font-semibold tabular-nums">{progress.completed}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{LEARNER_COURSE_COPY.certificateRemaining}</div>
            <div className="text-xl font-semibold tabular-nums">{Math.max(0, progress.total - progress.completed)}</div>
          </div>
        </div>
        {certificateQuery.isError ? (
          <InlineError description={LEARNER_COURSE_COPY.certificateCheckPending} error={certificateQuery.error} />
        ) : null}
        {verificationHref ? (
          <Button
            variant="outline"
            className="w-full"
            nativeButton={false}
            render={<AppLink href={verificationHref} />}
          >
            <Award data-icon="inline-start" aria-hidden="true" />
            {LEARNER_COURSE_COPY.verifyCertificate}
          </Button>
        ) : (
          <LmsStatusBadge
            status={
              progress.percent === 100 ? LmsStatuses.READY : isEnrolled ? LmsStatuses.IN_PROGRESS : LmsStatuses.LIMITED
            }
            label={
              progress.percent === 100
                ? LEARNER_COURSE_COPY.certificateCheckPending
                : isEnrolled
                  ? LEARNER_COURSE_COPY.inProgress
                  : LEARNER_COURSE_COPY.notEnrolled
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

function EmptyModuleState({ description, icon, title }: { description: string; icon: React.ReactNode; title: string }) {
  return (
    <div className="bg-muted/30 text-muted-foreground flex items-start gap-3 rounded-lg border border-dashed p-4">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-medium">{title}</span>
        <span className="block text-sm leading-relaxed">{description}</span>
      </span>
    </div>
  )
}

function buildCourseProgressSnapshot(
  course: AppCourse,
  courseUuid: string,
  trailData?: AppTrailData | null,
): CourseProgressSnapshot {
  const cleanCourseUuid = normalizeCourseUuid(course.course_uuid || courseUuid)
  const run = trailData?.runs?.find(activeRun => normalizeCourseUuid(activeRun.course?.course_uuid) === cleanCourseUuid)
  const completedActivityIds = new Set(
    (run?.steps ?? [])
      .filter(step => step.complete === true || step.completed === true)
      .map(step => Number(step.activity_id))
      .filter(Number.isFinite),
  )
  const items = (course.chapters ?? []).flatMap((chapter, chapterIndex) =>
    (chapter.activities ?? []).map((activity, activityIndex) => {
      const cleanActivityUuid = normalizeActivityUuid(activity.activity_uuid)
      const activityId = Number(activity.id)
      const complete = Number.isFinite(activityId) && completedActivityIds.has(activityId)
      return {
        activity,
        chapterName: chapter.name || `Chapter ${chapterIndex + 1}`,
        cleanActivityUuid,
        complete,
        href: `${getAbsoluteUrl('')}/course/${courseUuid}/activity/${cleanActivityUuid}`,
        index: activityIndex,
        returned: isReturnedActivity(activity),
      }
    }),
  )
  const completed = items.filter(item => item.complete).length
  const total = items.length
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

  return {
    completed,
    items,
    nextItem: items.find(item => !item.complete) ?? null,
    percent,
    returnedItems: items.filter(item => item.returned),
    total,
  }
}

function firstCourseActivity(course: AppCourse) {
  const first = course.chapters?.flatMap(chapter => chapter.activities ?? [])[0]
  if (!first) return null
  return {
    activity: first,
    href: `${getAbsoluteUrl('')}/course/${normalizeCourseUuid(course.course_uuid)}/activity/${normalizeActivityUuid(first.activity_uuid)}`,
  }
}

function normalizeCourseUuid(value?: string | null) {
  return (value ?? '').replace(/^course_/, '')
}

function normalizeActivityUuid(value?: string | null) {
  return (value ?? '').replace(/^activity_/, '')
}

function isReturnedActivity(activity: AppActivity) {
  const candidate = activity as AppActivity & {
    latest_submission_status?: string | null
    release_state?: string | null
    submission_status?: string | null
    status?: string | null
  }
  return (
    candidate.submission_status === 'RETURNED' ||
    candidate.latest_submission_status === 'RETURNED' ||
    candidate.release_state === 'RETURNED_FOR_REVISION' ||
    candidate.status === 'RETURNED'
  )
}
