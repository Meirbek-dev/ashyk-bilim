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
  ShieldCheck,
} from 'lucide-react'
import ConflictAlert from '@components/Dashboard/Pages/Course/ConflictResolutionModal'
import { buildCourseWorkspacePath, prefixedCourseUuid } from '@/lib/course-management'
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server'
import { CourseProvider, useCourse } from '@components/Contexts/CourseContext'
import type { CourseWorkspaceStage } from '@/lib/course-management'
import { getAbsoluteUrl } from '@services/config/config'
import { CourseStatusBadge } from './courseWorkflowUi'
import { useDirtyGuard } from '@/hooks/useDirtyGuard'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface CourseWorkspacePageShellProps {
  courseuuid: string
  activeStage: CourseWorkspaceStage
  initialCourse: any
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
  const course = useCourse()
  const { readiness } = course
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const dirtyGuard = useDirtyGuard({
    interceptInAppNavigation: true,
    message: t('unsavedChangesWarning'),
  })
  const stageConfig = [
    {
      key: 'details',
      label: t('tabs.details'),
      icon: FileCog,
      capability: 'canEditDetails',
    },
    {
      key: 'curriculum',
      label: t('tabs.content'),
      icon: FileStack,
      capability: 'canEditCurriculum',
    },
    {
      key: 'gradebook',
      label: t('tabs.gradebook'),
      icon: LayoutDashboard,
      capability: 'canReviewCourse',
    },
    {
      key: 'access',
      label: t('tabs.settings'),
      icon: Globe,
      capability: 'canManageSettings',
    },
    {
      key: 'certificate',
      label: t('tabs.certificate'),
      icon: Award,
      capability: 'canManageCertificate',
    },
    {
      key: 'review',
      label: t('tabs.publish'),
      icon: CheckCircle2,
      capability: 'canReviewCourse',
    },
  ] as const
  const visibleStages = stageConfig.filter(stage => capabilities[stage.capability])

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
            <CourseStatusBadge status={course.courseStructure.public ? 'public' : 'private'} />
            <CourseStatusBadge status={readiness.readyToPublish ? 'ready' : 'needs-review'} />
            {dirtyGuard.hasDrafts ? <CourseStatusBadge status="unsaved" /> : null}
          </div>
        }
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {activeStage !== 'review' ? (
              <Button
                size="sm"
                nativeButton={false}
                variant="ghost"
                render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'review')} />}
                className="h-9 gap-2 px-3 text-xs font-semibold"
              >
                <ShieldCheck className="size-4" />
                <span>{t('tabs.publish')}</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              nativeButton={false}
              variant="outline"
              render={<a href={getAbsoluteUrl(`/course/${courseuuid}`)} aria-label={t('previewButton')} />}
              className="h-9 gap-2 px-3 text-xs font-semibold"
            >
              <Eye className="size-4" />
              <span>{t('previewButton')}</span>
            </Button>
          </div>
        }
      >
        <div className="flex h-12 items-end gap-0 overflow-x-auto">
          {visibleStages.map(stage => {
            const Icon = stage.icon
            const isActive = stage.key === activeStage
            return (
              <AppLink
                key={stage.key}
                href={buildCourseWorkspacePath(courseuuid, stage.key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-full shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'border-primary text-foreground dark:border-primary dark:text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
                <span className="whitespace-nowrap">{stage.label}</span>
                {mounted && stage.key === 'review' && !readiness.readyToPublish && readiness.issues.length > 0 ? (
                  <span className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
                    {readiness.issues.length}
                  </span>
                ) : null}
              </AppLink>
            )
          })}
        </div>
      </DashHeader>

      <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <ConflictAlert />
        {children}
      </main>
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
    <CourseProvider courseuuid={prefixedCourseUuid(courseuuid)} withUnpublishedActivities initialCourse={initialCourse}>
      <CourseWorkspaceChrome courseuuid={courseuuid} activeStage={activeStage} capabilities={capabilities}>
        {children}
      </CourseWorkspaceChrome>
    </CourseProvider>
  )
}
