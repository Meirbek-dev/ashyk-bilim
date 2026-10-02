'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, ExternalLink, Eye, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CourseStatusBadge,
  courseReadinessQueryOptions,
  courseWorkflowCardClass,
  useReadinessIssueMessage,
} from './courseWorkflowUi'
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server'
import { CourseArchiveDialog, CourseRestoreDialog } from './CourseArchiveDialog'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { useCourse } from '@components/Contexts/CourseContext'
import { InlineError } from '@/components/ui/error-state'
import type { CourseReadiness } from '@services/courses/readiness'
import { useCourseEditorStore } from '@/stores/courses'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import AppLink from '@/components/ui/AppLink'

export default function CourseReviewPublish({
  courseuuid,
  capabilities,
}: {
  courseuuid: string
  capabilities: CourseWorkspaceCapabilities
}) {
  const t = useTranslations('DashPage.CourseManagement.Review')
  const tArchive = useTranslations('DashPage.CourseManagement.Archive')
  const course = useCourse()
  const { refreshCourse, updateAccess } = useCoursesMutations(course.courseStructure.course_uuid, true)
  const [lifecycleDialog, setLifecycleDialog] = useState<'archive' | 'restore' | null>(null)
  const setConflict = useCourseEditorStore(state => state.setConflict)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [privateConfirmOpen, setPrivateConfirmOpen] = useState(false)
  const readinessQuery = useQuery(courseReadinessQueryOptions(course.courseStructure.course_uuid))
  const readiness = readinessQuery.data
  const isPublic = course.courseStructure.public
  // UX-206 (as UX-202/203): the visibility button is disabled while the request
  // runs, so focus falls to <body> after publish / the make-private confirm —
  // hand it back to the button once it is enabled again.
  const isBusy = isPending || isRefreshing
  const visibilityButtonRef = useRef<HTMLButtonElement>(null)
  const refocusVisibilityButton = useRef(false)
  useEffect(() => {
    if (isBusy || !refocusVisibilityButton.current) return
    refocusVisibilityButton.current = false
    visibilityButtonRef.current?.focus()
  }, [isBusy])

  const toggleVisibility = () => {
    if (!capabilities.canManageAccess) return
    const nextPublic = !isPublic
    setPrivateConfirmOpen(false)
    refocusVisibilityButton.current = true

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

  const lifecycleDialogs = (
    <>
      <CourseArchiveDialog
        open={lifecycleDialog === 'archive'}
        onOpenChange={open => setLifecycleDialog(open ? 'archive' : null)}
        courseUuid={courseuuid}
        courseName={course.courseStructure.name ?? ''}
        onDone={() => void refreshCourse()}
      />
      <CourseRestoreDialog
        open={lifecycleDialog === 'restore'}
        onOpenChange={open => setLifecycleDialog(open ? 'restore' : null)}
        courseUuid={courseuuid}
        courseName={course.courseStructure.name ?? ''}
        onDone={() => void refreshCourse()}
      />
    </>
  )

  if (capabilities.isArchived) {
    // Frozen: no readiness, no publish - the way back is «Восстановить» (COURSE_ARCHIVING 9.3).
    return (
      <div className="flex flex-col gap-6">
        <section className={`${courseWorkflowCardClass} p-6`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance">
                  {tArchive('reviewTitle')}
                </h1>
                <CourseStatusBadge status="archived" />
              </div>
              <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 text-pretty">
                {tArchive('reviewDescription')}
              </p>
            </div>
            {capabilities.canArchiveCourse ? (
              <Button onClick={() => setLifecycleDialog('restore')}>
                <ArchiveRestore data-icon="inline-start" aria-hidden />
                {tArchive('restoreAction')}
              </Button>
            ) : null}
          </div>
        </section>
        {lifecycleDialogs}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={`${courseWorkflowCardClass} p-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance">
              {isPublic ? t('publishedTitle') : readiness?.ready ? t('readyTitle') : t('notReadyTitle')}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 text-pretty">
              {isPublic ? t('publishedDescription') : t('description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <AppLink
                  href={`/course/${courseuuid}?preview=learner`}
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
              // UX-200: going private cuts off learners outside the linked groups — confirm first.
              <Button
                variant={isPublic ? 'outline' : 'default'}
                onClick={isPublic ? () => setPrivateConfirmOpen(true) : toggleVisibility}
                ref={visibilityButtonRef}
                disabled={isBusy || publishDisabled}
              >
                {isPending || isRefreshing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                {isPublic ? t('movePrivate') : t('publishCourse')}
              </Button>
            ) : null}
            {capabilities.canArchiveCourse ? (
              <Button variant="outline" onClick={() => setLifecycleDialog('archive')} disabled={isBusy}>
                <Archive data-icon="inline-start" aria-hidden />
                {tArchive('archiveAction')}
              </Button>
            ) : null}
            <AlertDialog open={privateConfirmOpen} onOpenChange={setPrivateConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('movePrivateConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('movePrivateConfirmMessage')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending || isRefreshing} />
                  <AlertDialogAction
                    variant="destructive"
                    onClick={toggleVisibility}
                    disabled={isPending || isRefreshing}
                  >
                    {t('movePrivate')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
      {lifecycleDialogs}
    </div>
  )
}

function ReadinessIssues({ readiness }: { readiness: CourseReadiness }) {
  const t = useTranslations('DashPage.CourseManagement.Review')
  const issueMessage = useReadinessIssueMessage()
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
          key={`${issue.code}-${issue.activity_id ?? 'course'}`}
          variant={issue.severity === 'blocker' ? 'destructive' : 'default'}
        >
          {issue.severity === 'blocker' ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}
          <AlertTitle>{issue.severity === 'blocker' ? t('blockerLabel') : t('warningLabel')}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{issueMessage(issue)}</span>
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
