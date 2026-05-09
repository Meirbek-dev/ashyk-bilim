import { ArrowRight, BookOpenCheck, Check, ChevronDown, Circle, FileText, Layers, Trophy, Video } from 'lucide-react';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAbsoluteUrl } from '@services/config/config';
import AppLink from '@/components/ui/AppLink';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

interface CourseProgressProps {
  course: any;
  isOpen: boolean;
  onClose: () => void;
  trailData: any;
}

const CourseProgress: FC<CourseProgressProps> = ({ course, isOpen, onClose, trailData }) => {
  const t = useTranslations('Courses.CoursesActions');
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const cleanCourseUuid = course.course_uuid?.replace('course_', '');

  const completedActivityIds = useMemo(() => {
    const run = trailData?.runs?.find((candidateRun: any) => {
      const runCourseUuid = candidateRun.course?.course_uuid ?? candidateRun.course_uuid;
      return runCourseUuid?.replace('course_', '') === cleanCourseUuid;
    });

    return new Set(
      (run?.steps ?? [])
        .filter((step: any) => step.complete === true && typeof step.activity_id === 'number')
        .map((step: any) => step.activity_id),
    );
  }, [cleanCourseUuid, trailData]);

  const { chapterProgress, totalActivities, completedActivities } = useMemo(() => {
    let nextTotalActivities = 0;
    let nextCompletedActivities = 0;
    const nextChapterProgress: Record<string, { completed: number; total: number }> = {};

    course.chapters.forEach((chapter: any) => {
      const chapterActivities = chapter.activities ?? [];
      const chapterTotal = chapterActivities.length;
      let chapterCompleted = 0;

      chapterActivities.forEach((activity: any) => {
        if (completedActivityIds.has(activity.id)) {
          chapterCompleted += 1;
        }
      });

      nextTotalActivities += chapterTotal;
      nextCompletedActivities += chapterCompleted;
      nextChapterProgress[chapter.chapter_uuid] = { completed: chapterCompleted, total: chapterTotal };
    });

    return {
      chapterProgress: nextChapterProgress,
      totalActivities: nextTotalActivities,
      completedActivities: nextCompletedActivities,
    };
  }, [completedActivityIds, course.chapters]);

  function isActivityDone(activity: any) {
    return completedActivityIds.has(activity.id);
  }

  const progressPercentage = totalActivities === 0 ? 0 : Math.round((completedActivities / totalActivities) * 100);

  const toggleChapter = (chapterUuid: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterUuid)) {
        next.delete(chapterUuid);
      } else {
        next.add(chapterUuid);
      }
      return next;
    });
  };

  const getActivityTypeIcon = (activityType: string, isDone: boolean) => {
    const iconClass = cn('size-4 shrink-0', isDone ? 'text-primary' : 'text-muted-foreground');

    switch (activityType) {
      case 'TYPE_VIDEO': {
        return <Video className={iconClass} />;
      }
      case 'TYPE_DOCUMENT': {
        return <FileText className={iconClass} />;
      }
      case 'TYPE_DYNAMIC': {
        return <Layers className={iconClass} />;
      }
      case 'TYPE_ASSIGNMENT': {
        return <BookOpenCheck className={iconClass} />;
      }
      default: {
        return <FileText className={iconClass} />;
      }
    }
  };

  const isCompleted = progressPercentage === 100;

  const dialogContent = (
    <div className="flex flex-col gap-6">
      {/* Progress Header */}
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm',
          isCompleted && 'ring-1 ring-primary/20',
        )}
      >
        {/* Background Pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at center, currentColor 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        />

        <div className="relative flex items-center gap-5">
          {/* Circular Progress */}
          <div className="relative flex size-20 shrink-0 items-center justify-center">
            <svg
              className="size-full -rotate-90"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${progressPercentage * 2.64} 264`}
                className="text-primary transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {isCompleted ? (
                <Trophy className="text-primary size-6" />
              ) : (
                <span className="text-foreground text-lg font-bold tabular-nums">{progressPercentage}%</span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-1 flex-col gap-1.5">
            <p className={cn('text-lg font-semibold', isCompleted ? 'text-primary' : 'text-foreground')}>
              {isCompleted ? t('progressCard.courseCompleted') : `${completedActivities} of ${totalActivities}`}
            </p>
            <p className="text-muted-foreground text-sm">
              {isCompleted ? t('progressCard.completedAllActivities') : t('progressCard.activitiesCompletedLabel')}
            </p>

            {/* Progress Bar */}
            <div className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-all duration-500 ease-out', 'bg-primary')}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Chapters List */}
      <ScrollArea className="max-h-[400px]">
        <div className="mb-4 flex flex-col gap-3 p-0.5">
          {course.chapters.map((chapter: any, chapterIndex: number) => {
            const chapterStats = chapterProgress[chapter.chapter_uuid];
            const isChapterComplete = chapterStats?.completed === chapterStats?.total;
            const isExpanded = expandedChapters.has(chapter.chapter_uuid);
            const chapterPercentage =
              !chapterStats || chapterStats.total === 0
                ? 0
                : Math.round((chapterStats.completed / chapterStats.total) * 100);

            return (
              <div
                key={chapter.chapter_uuid}
                className="border-border hover:border-border/80 overflow-hidden rounded-xl border transition-shadow"
              >
                {/* Chapter Header */}
                <button
                  type="button"
                  onClick={() => toggleChapter(chapter.chapter_uuid)}
                  className={cn(
                    'flex w-full items-center gap-3 bg-card p-4 text-left transition-colors hover:bg-muted/60',
                    isChapterComplete && 'bg-primary/5',
                  )}
                >
                  {/* Chapter Number */}
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                      isChapterComplete ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isChapterComplete ? <Check className="size-4" /> : chapterIndex + 1}
                  </div>

                  {/* Chapter Info */}
                  <div className="flex flex-1 flex-col gap-10.5 overflow-hidden">
                    <span className="text-foreground truncate font-medium">{chapter.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {t('progressCard.chapterActivitiesCount', {
                          completed: chapterStats?.completed ?? 0,
                          total: chapterStats?.total ?? 0,
                        })}
                      </span>
                      {isChapterComplete && (
                        <Badge
                          variant="secondary"
                          className="bg-teal-100 text-teal-700"
                        >
                          {t('progressCard.complete')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Mini Progress + Chevron */}
                  <div className="flex items-center gap-3">
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200 sm:block">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          isChapterComplete ? 'bg-teal-500' : 'bg-primary',
                        )}
                        style={{ width: `${chapterPercentage}%` }}
                      />
                    </div>
                    <ChevronDown
                      className={cn(
                        'size-5 shrink-0 text-neutral-400 transition-transform duration-200',
                        isExpanded && 'rotate-180',
                      )}
                    />
                  </div>
                </button>

                {/* Activities List */}
                {isExpanded && (
                  <div className="border-t border-neutral-100 bg-neutral-50/50">
                    {chapter.activities.map((activity: any, activityIndex: number) => {
                      const activityId = activity.activity_uuid.replace('activity_', '');
                      const courseId = course.course_uuid.replace('course_', '');
                      const isDone = isActivityDone(activity);

                      return (
                        <AppLink
                          key={activity.activity_uuid}
                          href={`${getAbsoluteUrl('')}/course/${courseId}/activity/${activityId}`}
                          onClick={onClose}
                        >
                          <div
                            className={cn(
                              'group flex items-center gap-3 px-4 py-3 transition-colors',
                              activityIndex !== chapter.activities.length - 1 && 'border-b border-neutral-100',
                              isDone ? 'hover:bg-teal-50/50' : 'hover:bg-white',
                            )}
                          >
                            {/* Status Indicator */}
                            <div className="flex size-6 shrink-0 items-center justify-center">
                              {isDone ? (
                                <div className="flex size-5 items-center justify-center rounded-full bg-teal-100">
                                  <Check className="size-3 text-teal-600" />
                                </div>
                              ) : (
                                <Circle className="size-4 text-neutral-300" />
                              )}
                            </div>

                            {/* Activity Type Icon */}
                            {getActivityTypeIcon(activity.activity_type, isDone)}

                            {/* Activity Name */}
                            <span
                              className={cn(
                                'flex-1 truncate text-sm',
                                isDone ? 'text-teal-700' : 'text-neutral-700 group-hover:text-neutral-900',
                              )}
                            >
                              {activity.name}
                            </span>

                            {/* Arrow */}
                            <ArrowRight
                              className={cn(
                                'size-4 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100',
                                isDone ? 'text-teal-500' : 'text-neutral-400',
                              )}
                            />
                          </div>
                        </AppLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <Modal
      isDialogOpen={isOpen}
      onOpenChange={onClose}
      dialogContent={dialogContent}
      dialogTitle={t('courseProgress')}
      dialogDescription={t('activitiesCompleted', {
        completed: completedActivities,
        total: totalActivities,
      })}
      minWidth="md"
    />
  );
};

export default CourseProgress;
