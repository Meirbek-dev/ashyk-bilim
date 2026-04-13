'use client';

import {
  CourseStatusBadge,
  courseWorkflowCardClass,
  courseWorkflowMutedPanelClass,
  courseWorkflowSummaryCardClass,
} from './courseWorkflowUi';
import { AlertTriangle, ArrowRight, CheckCircle2, FileStack, Globe, Users } from 'lucide-react';
import { buildCourseWorkspacePath, getCourseContentStats } from '@/lib/course-management';
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCourse } from '@components/Contexts/CourseContext';
import { Button } from '@/components/ui/button';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';

export default function CourseWorkspaceOverview({
  courseuuid,
  capabilities,
}: {
  courseuuid: string;
  capabilities: CourseWorkspaceCapabilities;
}) {
  const t = useTranslations('DashPage.CourseManagement.Overview');
  const tReadiness = useTranslations('DashPage.CourseManagement.Readiness');
  const course = useCourse();
  const stats = getCourseContentStats(course.courseStructure);
  const { readiness } = course;
  const contributors = course.editorData.contributors.data ?? [];
  const certifications = course.editorData.certifications.data ?? [];
  const linkedUserGroups = course.editorData.linkedUserGroups.data ?? [];
  const isPrivateWithNoGroups = !course.courseStructure.public && linkedUserGroups.length === 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className={`${courseWorkflowCardClass} p-6`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('readyLabel')}
              </div>
              <h2 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
                {readiness.readyToPublish ? t('readyTitle') : t('notReadyTitle')}
              </h2>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
                {readiness.readyToPublish ? t('readyDescription') : t('notReadyDescription')}
              </p>
            </div>
            <CourseStatusBadge status={readiness.readyToPublish ? 'ready' : 'needs-review'} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {capabilities.canEditCurriculum ? (
              <Button
                nativeButton={false}
                render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'curriculum')} />}
              >
                {t('openCurriculum')}
              </Button>
            ) : null}
          </div>
          {capabilities.canReviewCourse ? (
            <div className="text-muted-foreground mt-4 text-sm">
              <AppLink
                href={buildCourseWorkspacePath(courseuuid, 'review')}
                className="text-foreground font-medium underline underline-offset-4"
              >
                {t('reviewReadiness')}
              </AppLink>
            </div>
          ) : null}
        </div>

        <div className={courseWorkflowSummaryCardClass}>
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('workspacePulse')}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-muted-foreground">{t('chapters')}</div>
              <div className="text-foreground mt-1 text-3xl font-semibold">{stats.chapters}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-muted-foreground">{t('activities')}</div>
              <div className="text-foreground mt-1 text-3xl font-semibold">{stats.activities}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-muted-foreground">{t('contributors')}</div>
              <div className="text-foreground mt-1 text-3xl font-semibold">{contributors.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4" />
            {t('readinessChecklist')}
          </div>
          <div className="mt-4 space-y-3">
            {readiness.checklist.map((item) => (
              <AppLink
                key={item.id}
                href={buildCourseWorkspacePath(courseuuid, item.href || 'overview')}
                className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
              >
                <CourseStatusBadge status={item.complete ? 'ready' : 'needs-review'} />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground font-medium">{tReadiness(`checklist.${item.id}.title`)}</div>
                  <div className="text-muted-foreground text-sm">{tReadiness(`checklist.${item.id}.description`)}</div>
                </div>
                <ArrowRight className="text-muted-foreground ml-auto size-4 shrink-0" />
              </AppLink>
            ))}
          </div>
        </div>

        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <FileStack className="size-4" />
            {t('curriculumSnapshot')}
          </div>
          <div className="text-muted-foreground mt-4 space-y-3 text-sm">
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-foreground font-medium">{t('chapterCount', { count: stats.chapters })}</div>
              <div className="mt-1">{t('activityCountDescription', { count: stats.activities })}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-foreground font-medium">{t('nextStep')}</div>
              <div className="mt-1">{t('nextStepDescription')}</div>
            </div>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            className="mt-4 w-full justify-between"
            render={<AppLink href={buildCourseWorkspacePath(courseuuid, 'curriculum')} />}
          >
            {t('openCurriculum')}
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4" />
            {t('governanceSnapshot')}
          </div>
          <div className="text-muted-foreground mt-4 space-y-3 text-sm">
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-foreground font-medium">{t('sections.access')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Globe className="text-muted-foreground size-4" />
                {course.courseStructure.public ? t('access.publicState') : t('access.privateState')}
              </div>
              {isPrivateWithNoGroups && capabilities.canManageAccess ? (
                <Alert className="border-border bg-muted text-foreground mt-2 py-2">
                  <AlertTriangle className="size-3.5" />
                  <AlertDescription className="text-muted-foreground text-xs">
                    {t.rich('access.privateNoGroupsWarning', {
                      link: (chunks) => (
                        <AppLink
                          href={buildCourseWorkspacePath(courseuuid, 'access')}
                          className="font-semibold underline underline-offset-2"
                        >
                          {chunks}
                        </AppLink>
                      ),
                    })}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-foreground font-medium">{t('sections.collaboration')}</div>
              <div className="mt-1">{t('collaboration.loadedRecords', { count: contributors.length })}</div>
            </div>
            <div className={courseWorkflowMutedPanelClass}>
              <div className="text-foreground font-medium">{t('sections.certificate')}</div>
              <div className="mt-1">
                {certifications.length > 0 ? t('certificate.configured') : t('certificate.notConfigured')}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
