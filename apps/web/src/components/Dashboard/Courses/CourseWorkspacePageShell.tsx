'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Award,
  FileCog,
  FileStack,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Users,
} from 'lucide-react'
import ConflictAlert from '@components/Dashboard/Pages/Course/ConflictResolutionModal'
import { buildCourseWorkspacePath, isCourseArchived, prefixedCourseUuid } from '@/lib/course-management'
import { CourseRestoreDialog } from './CourseArchiveDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatDate } from '@/lib/date'
import { unixToIso } from '@/lib/api/contract'
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server'
import { CourseProvider, useCourse } from '@components/Contexts/CourseContext'
import type { CourseWorkspaceStage } from '@/lib/course-management'
import { CourseStatusBadge, courseReadinessQueryOptions } from './courseWorkflowUi'
import { useQuery } from '@tanstack/react-query'
import { useDirtyGuard } from '@/hooks/useDirtyGuard'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

const emptySubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

interface CourseWorkspacePageShellProps {
  courseuuid: string
  activeStage: CourseWorkspaceStage
  initialCourse: AppCourse
  capabilities: CourseWorkspaceCapabilities
  children: ReactNode
}

function CourseWorkspaceChrome({
  courseuuid,
  activeStage,
  capabilities,
  children,
}: Omit<CourseWorkspacePageShellProps, 'initialCourse'>) {
  const t = useTranslations('DashPage.CourseManagement.Workspace')
  const tArchive = useTranslations('DashPage.CourseManagement.Archive')
  const locale = useLocale()
  const course = useCourse()
  const isArchived = isCourseArchived(course.courseStructure)
  const [restoreOpen, setRestoreOpen] = useState(false)
  // Same server verdict the review tab renders — the client-side checklist
  // (`getCourseReadinessSummary`) disagreed with it ("needs review" vs "ready").
  const readinessQuery = useQuery(courseReadinessQueryOptions(course.courseStructure.course_uuid))
  const readiness = readinessQuery.data
  const blockerCount = readiness?.issues.filter(issue => issue.severity === 'blocker').length ?? 0
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot)
  const dirtyGuard = useDirtyGuard({
    interceptInAppNavigation: true,
    message: t('unsavedChangesWarning'),
  })
  // The overview tab follows the details stage, as before the stage map existed.
  const stageConfig = [
    { key: 'overview', label: t('tabs.overview'), icon: LayoutGrid, stage: 'details' },
    { key: 'details', label: t('tabs.details'), icon: FileCog, stage: 'details' },
    { key: 'curriculum', label: t('tabs.content'), icon: FileStack, stage: 'curriculum' },
    { key: 'gradebook', label: t('tabs.gradebook'), icon: LayoutDashboard, stage: 'gradebook' },
    { key: 'access', label: t('tabs.settings'), icon: Globe, stage: 'access' },
    { key: 'collaboration', label: t('tabs.collaboration'), icon: Users, stage: 'collaboration' },
    { key: 'certificate', label: t('tabs.certificate'), icon: Award, stage: 'certificate' },
    { key: 'review', label: t('tabs.publish'), icon: CheckCircle2, stage: 'review' },
  ] as const
  // Archived: the stages stay readable (`stages`), the edit flags are off.
  const visibleStages = stageConfig.filter(stage => capabilities.stages[stage.stage])

  return (
    <div className="bg-background flex min-h-screen min-w-0 flex-1 flex-col">
      <AlertDialog
        open={dirtyGuard.isPromptOpen}
        onOpenChange={open => {
          if (!open) dirtyGuard.cancelNavigation()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-muted/80 text-foreground dark:bg-muted/60 rounded-lg p-3">
              <AlertTriangle className="size-8" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('unsavedDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{dirtyGuard.promptMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('unsavedDialogStay')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={dirtyGuard.confirmNavigation}>
              {t('unsavedDialogLeave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DashHeader
        breadcrumbType="courses"
        lastBreadcrumb={course.courseStructure.name || t('untitledCourse')}
        title={course.courseStructure.name || t('untitledCourse')}
        badge={
          <div className="ml-1 flex flex-wrap items-center gap-1.5">
            {isArchived ? (
              <CourseStatusBadge status="archived" />
            ) : (
              <>
                <CourseStatusBadge status={course.courseStructure.public ? 'public' : 'private'} />
                {readiness ? <CourseStatusBadge status={readiness.ready ? 'ready' : 'needs-review'} /> : null}
              </>
            )}
            {dirtyGuard.hasDrafts ? <CourseStatusBadge status="unsaved" /> : null}
          </div>
        }
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              nativeButton={false}
              variant="outline"
              render={<AppLink href={`/course/${courseuuid}?preview=learner`} aria-label={t('previewButton')} />}
              className="h-9 gap-2 px-3 text-xs font-semibold"
            >
              <Eye className="size-4" />
              <span>{t('previewButton')}</span>
            </Button>
          </div>
        }
      >
        {/* Phones scroll the row; wider screens wrap it rather than hide the last tabs. */}
        <div className="flex h-12 [scrollbar-width:none] items-end gap-0 overflow-x-auto md:h-auto md:flex-wrap md:overflow-visible">
          {visibleStages.map(stage => {
            const Icon = stage.icon
            const isActive = stage.key === activeStage
            return (
              <AppLink
                key={stage.key}
                href={buildCourseWorkspacePath(courseuuid, stage.key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-12 shrink-0 items-center gap-2 border-b-2 px-2 py-3 text-sm font-medium transition-all duration-200 lg:px-3 xl:px-4',
                  isActive
                    ? 'border-primary text-foreground dark:border-primary dark:text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
                )}
              >
                <Icon className={cn('hidden size-4 shrink-0 xl:block', isActive && 'text-primary')} />
                <span className="whitespace-nowrap">{stage.label}</span>
                {mounted && stage.key === 'review' && readiness && !readiness.ready && blockerCount > 0 ? (
                  <span className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
                    {blockerCount}
                  </span>
                ) : null}
              </AppLink>
            )
          })}
        </div>
      </DashHeader>

      {isArchived ? (
        // Every write answers 409 `course-archived`; say so once, up top (COURSE_ARCHIVING 9.3).
        <Alert className="rounded-none border-x-0 border-t-0">
          <Lock className="size-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {tArchive('workspaceBanner', {
                date: formatDate(unixToIso(course.courseStructure.archived_at_unix) ?? '', locale),
              })}
            </span>
            {capabilities.canArchiveCourse ? (
              <Button size="sm" variant="outline" onClick={() => setRestoreOpen(true)}>
                {tArchive('restoreAction')}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <CourseRestoreDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        courseUuid={courseuuid}
        courseName={course.courseStructure.name || t('untitledCourse')}
      />

      <section className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <ConflictAlert />
        {/* Archived = view only: the native fieldset disables every control in the
            editing tabs; gradebook (exports) and review (restore) stay live. */}
        <fieldset disabled={isArchived && activeStage !== 'gradebook' && activeStage !== 'review'} className="contents">
          {children}
        </fieldset>
      </section>
    </div>
  )
}

export default function CourseWorkspacePageShell({
  courseuuid,
  activeStage,
  initialCourse,
  capabilities,
  children,
}: CourseWorkspacePageShellProps) {
  return (
    <CourseProvider
      courseuuid={prefixedCourseUuid(courseuuid)}
      withUnpublishedActivities
      initialCourse={{ ...initialCourse, chapters: initialCourse.chapters ?? [] }}
    >
      <CourseWorkspaceChrome courseuuid={courseuuid} activeStage={activeStage} capabilities={capabilities}>
        {children}
      </CourseWorkspaceChrome>
    </CourseProvider>
  )
}
