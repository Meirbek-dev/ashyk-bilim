'use client';

import {
  CourseStatusBadge,
  courseWorkflowCardClass,
  courseWorkflowMutedPanelClass,
  courseWorkflowSummaryCardClass,
} from './courseWorkflowUi';
import { buildCourseWorkspacePath, getCourseContentStats } from '@/lib/course-management';
import type { CourseWorkspaceCapabilities } from '@/lib/course-management-server';
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations';
import { ExternalLink, FileStack, Loader2, Users } from 'lucide-react';
import { useCourse } from '@components/Contexts/CourseContext';
import { getAbsoluteUrl } from '@services/config/config';
import { useCourseEditorStore } from '@/stores/courses';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function CourseReviewPublish({
  courseuuid,
  capabilities,
}: {
  courseuuid: string;
  capabilities: CourseWorkspaceCapabilities;
}) {
  const t = useTranslations('DashPage.CourseManagement.Review');
  const tReadiness = useTranslations('DashPage.CourseManagement.Readiness');
  const tOverview = useTranslations('DashPage.CourseManagement.Overview');
  const course = useCourse();
  const { updateAccess } = useCoursesMutations(course.courseStructure.course_uuid, true);
  const setConflict = useCourseEditorStore((state) => state.setConflict);
  const { readiness } = course;
  const stats = getCourseContentStats(course.courseStructure);
  const contributors = course.editorData.contributors.data ?? [];
  const contributorNames = contributors
    .slice(0, 3)
    .map((contributor: any) => {
      const parts = [contributor?.user?.first_name, contributor?.user?.last_name].filter(Boolean);
      return parts.join(' ') || contributor?.user?.username || contributor?.user?.email;
    })
    .filter(Boolean);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const criticalReady = readiness.checklist
    .filter((item) => ['details', 'curriculum'].includes(item.id))
    .every((item) => item.complete);

  const toggleVisibility = () => {
    if (!capabilities.canManageAccess) {
      return;
    }

    const wasPublic = course.courseStructure.public;

    startTransition(() => {
      void (async () => {
        try {
          setIsRefreshing(true);
          await updateAccess(
            { public: !wasPublic },
            {
              lastKnownUpdateDate: course.courseStructure.update_date,
            },
          );
          toast.success(wasPublic ? t('toasts.movedPrivate') : t('toasts.published'));
        } catch (error: any) {
          if (error?.status === 409) {
            setConflict({
              serverVersion: course.courseStructure,
              message: error?.detail || error?.message,
              pendingSave: async () => {
                await updateAccess(
                  { public: !wasPublic },
                  {
                    lastKnownUpdateDate: course.courseStructure.update_date,
                  },
                );
              },
            });
            return;
          }
          toast.error(error?.message || t('errors.visibilityUpdate'));
        } finally {
          setIsRefreshing(false);
        }
      })();
    });
  };

  return (
    <div className="space-y-6">
      <div className={`${courseWorkflowCardClass} p-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {t('sectionLabel')}
            </div>
            <h2 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
              {readiness.readyToPublish ? t('readyTitle') : t('notReadyTitle')}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">{t('description')}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={getAbsoluteUrl(`/course/${courseuuid}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="size-4" />
              {t('previewPublicPage')}
            </Button>
            {capabilities.canManageAccess ? (
              <Button
                onClick={toggleVisibility}
                disabled={isPending || isRefreshing || !criticalReady}
              >
                {isPending || isRefreshing ? <Loader2 className="size-4 animate-spin" /> : null}
                {course.courseStructure.public ? t('movePrivate') : t('publishCourse')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className={`${courseWorkflowCardClass} p-5`}>
          <div className="text-foreground text-sm font-semibold">{t('readinessChecklist')}</div>
          <div className="mt-4 space-y-3">
            {readiness.checklist.map((item) => (
              <div
                key={item.id}
                className="bg-muted/40 flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div>
                  <div className="text-foreground font-medium">{tReadiness(`checklist.${item.id}.title`)}</div>
                  <div className="text-muted-foreground mt-1 text-sm">
                    {tReadiness(`checklist.${item.id}.description`)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <CourseStatusBadge status={item.complete ? 'ready' : 'needs-review'} />
                  {item.href ? (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<AppLink href={buildCourseWorkspacePath(courseuuid, item.href)} />}
                    >
                      {t('openAction')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className={courseWorkflowSummaryCardClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                {t('launchState')}
              </div>
              <CourseStatusBadge status={course.courseStructure.public ? 'live' : 'private'} />
            </div>
            <div className="text-foreground mt-3 text-3xl font-semibold">
              {course.courseStructure.public ? t('launchStates.live') : t('launchStates.private')}
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              {course.courseStructure.public ? t('launchStateDescriptions.live') : t('launchStateDescriptions.private')}
            </div>
          </div>

          <div className={courseWorkflowSummaryCardClass}>
            <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {tOverview('workspacePulse')}
            </div>
            <div className="mt-4 grid gap-3">
              <div className={courseWorkflowMutedPanelClass}>
                <div className="text-muted-foreground flex items-center gap-2">
                  <FileStack className="size-4" />
                  {tOverview('curriculumSnapshot')}
                </div>
                <div className="text-foreground mt-2 text-2xl font-semibold">
                  {tOverview('chapterCount', { count: stats.chapters })}
                </div>
                <div className="text-muted-foreground mt-1 text-sm">
                  {tOverview('activityCountDescription', { count: stats.activities })}
                </div>
              </div>
              <div className={courseWorkflowMutedPanelClass}>
                <div className="text-muted-foreground flex items-center gap-2">
                  <Users className="size-4" />
                  {tOverview('sections.collaboration')}
                </div>
                <div className="text-foreground mt-2 text-2xl font-semibold">{contributors.length}</div>
                <div className="text-muted-foreground mt-1 text-sm">
                  {tOverview('collaboration.loadedRecords', { count: contributors.length })}
                </div>
                {contributorNames.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {contributorNames.map((name) => (
                      <span
                        key={name}
                        className="bg-background text-foreground rounded-full border px-2.5 py-1 text-xs"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={`${courseWorkflowCardClass} p-5`}>
            <div className="text-foreground text-sm font-semibold">{t('publishingNotes')}</div>
            <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-6">
              <div className={courseWorkflowMutedPanelClass}>{t('notes.visibility')}</div>
              <div className={courseWorkflowMutedPanelClass}>{t('notes.curriculum')}</div>
              <div className={courseWorkflowMutedPanelClass}>{t('notes.review')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
