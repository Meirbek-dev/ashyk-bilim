'use client';

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
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  BookCopy,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileCog,
  FileStack,
  Globe,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ConflictAlert from '@components/Dashboard/Pages/Course/ConflictResolutionModal';
import { buildCourseWorkspacePath, prefixedCourseUuid } from '@/lib/course-management';
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server';
import { CourseProvider, useCourse } from '@components/Contexts/CourseContext';
import type { CourseWorkspaceStage } from '@/lib/course-management';
import { getAbsoluteUrl } from '@services/config/config';
import { CourseStatusBadge } from './courseWorkflowUi';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { Button } from '@/components/ui/button';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CourseWorkspacePageShellProps {
  courseuuid: string;
  activeStage: CourseWorkspaceStage;
  initialCourse: any;
  capabilities: CourseWorkspaceCapabilities;
  children: ReactNode;
}

function CourseWorkspaceChrome({
  courseuuid,
  activeStage,
  capabilities,
  children,
}: Omit<CourseWorkspacePageShellProps, 'initialCourse'>) {
  const t = useTranslations('DashPage.CourseManagement.Workspace');
  const course = useCourse();
  const { readiness } = course;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const dirtyGuard = useDirtyGuard({
    interceptInAppNavigation: true,
    message: t('unsavedChangesWarning'),
  });
  const stageConfig = [
    { key: 'details', label: t('tabs.details'), icon: FileCog, capability: 'canEditDetails' },
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
    { key: 'access', label: t('tabs.settings'), icon: Globe, capability: 'canManageSettings' },
    {
      key: 'certificate',
      label: t('tabs.certificate'),
      icon: Sparkles,
      capability: 'canManageCertificate',
    },
    { key: 'review', label: t('tabs.publish'), icon: CheckCircle2, capability: 'canReviewCourse' },
  ] as const;
  const visibleStages = stageConfig.filter((stage) => capabilities[stage.capability]);

  return (
    <div className="bg-background flex min-h-screen min-w-0 flex-1 flex-col">
      <AlertDialog
        open={dirtyGuard.isPromptOpen}
        onOpenChange={(open) => {
          if (!open) dirtyGuard.cancelNavigation();
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
            <AlertDialogAction
              variant="destructive"
              onClick={dirtyGuard.confirmNavigation}
            >
              {t('unsavedDialogLeave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="border-border bg-background sticky top-0 z-20 border-b shadow-sm">
        {/* Title row */}
        <div className="flex h-16 items-center gap-4 px-4 lg:px-8">
          {/* Breadcrumb */}
          <AppLink
            href="/dash/courses"
            className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground flex shrink-0 items-center gap-2 text-sm transition-colors"
          >
            <BookCopy className="size-4 shrink-0" />
            <span className="hidden sm:inline">{t('breadcrumb')}</span>
          </AppLink>

          <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />

          <h1 className="text-foreground dark:text-foreground min-w-0 flex-1 truncate text-base font-semibold">
            {course.courseStructure.name || t('untitledCourse')}
          </h1>

          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <CourseStatusBadge status={course.courseStructure.public ? 'public' : 'private'} />
            <CourseStatusBadge status={readiness.readyToPublish ? 'ready' : 'needs-review'} />
            {dirtyGuard.hasDrafts ? <CourseStatusBadge status="unsaved" /> : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {activeStage !== 'review' ? (
              <Button
                size="sm"
                nativeButton={false}
                variant="ghost"
                render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'review')} />}
                className="gap-2"
              >
                <ShieldCheck className="size-4" />
                <span className="hidden sm:inline">{t('tabs.publish')}</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              nativeButton={false}
              variant="outline"
              render={<a href={getAbsoluteUrl(`/course/${courseuuid}`)} />}
              className="gap-2"
            >
              <Eye className="size-4" />
              <span className="hidden sm:inline">{t('previewButton')}</span>
            </Button>
          </div>
        </div>

        {/* Tab nav row */}
        <div className="border-border/50 flex h-12 items-end gap-0 overflow-x-auto border-t px-4 lg:px-8">
          {visibleStages.map((stage) => {
            const Icon = stage.icon;
            const isActive = stage.key === activeStage;
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
                <span className="hidden whitespace-nowrap sm:inline">{stage.label}</span>
                {mounted && stage.key === 'review' && !readiness.readyToPublish && readiness.issues.length > 0 ? (
                  <span className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
                    {readiness.issues.length}
                  </span>
                ) : null}
              </AppLink>
            );
          })}
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <ConflictAlert />
        {children}
      </main>
    </div>
  );
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
      initialCourse={initialCourse}
    >
      <CourseWorkspaceChrome
        courseuuid={courseuuid}
        activeStage={activeStage}
        capabilities={capabilities}
      >
        {children}
      </CourseWorkspaceChrome>
    </CourseProvider>
  );
}
