'use client'

import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  PlayCircle,
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
import type { LearnerCourseState } from '@/features/learner-course/api'
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
  learnerState?: LearnerCourseState | undefined
  isStateLoading?: boolean | undefined
  stateError?: Error | null | undefined
}

interface CourseActivityAgendaItem {
  activityId: number
  activityUuid: string
  title: string
  chapterName: string
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
  total: number
}

export function LearnerCourseModules({
  course,
  courseUuid,
  isAuthenticated,
  isEnrolled,
  onStartCourse,
  starting,
  learnerState,
  isStateLoading,
  stateError,
}: LearnerCourseModulesProps) {
  const t = useTranslations('LearnerCourse')
  const progress = useMemo(() => buildCourseProgressSnapshot(courseUuid, learnerState), [courseUuid, learnerState])

  return (
    <div className="grid gap-4">
      {stateError ? <InlineError description={t('stateUnavailable')} error={stateError} /> : null}
      <CourseEnrollmentState
        course={course}
        isAuthenticated={isAuthenticated}
        isEnrolled={learnerState?.enrolled ?? isEnrolled}
        nextItem={progress.nextItem}
        onStartCourse={onStartCourse}
        starting={starting}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]" aria-busy={isStateLoading}>
        <LearnerAgendaModule isEnrolled={learnerState?.enrolled ?? isEnrolled} progress={progress} />
        <CertificateProgressModule
          isEnrolled={learnerState?.enrolled ?? isEnrolled}
          progress={progress}
          certificate={learnerState?.certificate}
        />
      </div>
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
  const title = isEnrolled ? t('enrolledTitle') : isAuthenticated ? t('previewTitle') : t('signInTitle')
  const description = isEnrolled
    ? nextItem
      ? t('continueWith', { activity: nextItem.title || t('nextActivityFallback') })
      : t('allActivitiesComplete')
    : t('previewDescription')
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
              {t('continue')}
            </Button>
          ) : (
            <Button className="w-full" disabled={starting} onClick={onStartCourse}>
              <PlayCircle data-icon="inline-start" aria-hidden="true" />
              {isAuthenticated ? t('startCourse') : t('signIn')}
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
              {t('previewSyllabus')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function LearnerAgendaModule({ isEnrolled, progress }: { isEnrolled: boolean; progress: CourseProgressSnapshot }) {
  const t = useTranslations('LearnerCourse')
  const agendaItems = progress.items.filter(item => !item.complete).slice(0, 5)
  const visibleItems = agendaItems.length > 0 ? agendaItems : progress.items.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4" />
              {t('agendaTitle')}
            </CardTitle>
            <CardDescription>
              {isEnrolled ? t('agendaDescription') : t('agendaLocked')}
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
            title={t('noActivitiesTitle')}
            description={t('noActivitiesDescription')}
          />
        ) : (
          <div className="divide-border overflow-hidden rounded-lg border">
            {visibleItems.map(item => (
              <AppLink
                key={item.activityUuid}
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
                    {item.title || t('untitledActivity')}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">{item.chapterName}</span>
                </span>
                {item.returned ? <Badge variant="destructive">{t('returned')}</Badge> : null}
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
  isEnrolled,
  progress,
  certificate,
}: {
  isEnrolled: boolean
  progress: CourseProgressSnapshot
  certificate?: LearnerCourseState['certificate'] | undefined
}) {
  const t = useTranslations('LearnerCourse')
  const verificationHref = certificate?.issued && certificate.href ? getAbsoluteUrl(certificate.href) : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="size-4" />
          {t('certificateProgress')}
        </CardTitle>
        <CardDescription>
          {certificate?.issued ? t('certificateEarned') : t('certificateDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('completion')}</span>
            <span className="font-medium tabular-nums">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{t('certificateDone')}</div>
            <div className="text-xl font-semibold tabular-nums">{progress.completed}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{t('certificateRemaining')}</div>
            <div className="text-xl font-semibold tabular-nums">{Math.max(0, progress.total - progress.completed)}</div>
          </div>
        </div>
        {verificationHref ? (
          <Button
            variant="outline"
            className="w-full"
            nativeButton={false}
            render={<AppLink href={verificationHref} />}
          >
            <Award data-icon="inline-start" aria-hidden="true" />
            {t('verifyCertificate')}
          </Button>
        ) : (
          <LmsStatusBadge
            status={
              certificate?.eligible ? LmsStatuses.READY : isEnrolled ? LmsStatuses.IN_PROGRESS : LmsStatuses.LIMITED
            }
            label={
              certificate?.eligible
                ? t('certificateCheckPending')
                : isEnrolled
                  ? t('inProgress')
                  : t('notEnrolled')
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

function buildCourseProgressSnapshot(courseUuid: string, state?: LearnerCourseState): CourseProgressSnapshot {
  const items =
    state?.outline.flatMap(chapter =>
      chapter.activities.map((activity, activityIndex) => ({
        activityId: activity.id,
        activityUuid: activity.uuid,
        title: activity.title,
        chapterName: chapter.title,
        complete: activity.complete,
        href: `${getAbsoluteUrl('')}/course/${courseUuid}/activity/${normalizeActivityUuid(activity.uuid)}`,
        index: activityIndex,
        returned: activity.state === 'returned',
      })),
    ) ?? []
  const completed = state?.progress.completed_required_count ?? 0
  const total = state?.progress.total_required_count ?? 0
  const percent = Math.round(state?.progress.progress_pct ?? 0)
  const nextActivityUuid = state?.next_action.activity_uuid

  return {
    completed,
    items,
    nextItem: items.find(item => item.activityUuid === nextActivityUuid) ?? items.find(item => !item.complete) ?? null,
    percent,
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
