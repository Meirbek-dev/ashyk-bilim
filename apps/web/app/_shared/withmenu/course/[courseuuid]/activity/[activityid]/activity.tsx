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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  BookOpenCheck,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Circle,
  Edit2,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  UserRoundPen,
} from 'lucide-react';
import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media';
import { AssignmentsTaskProvider } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import { markActivityAsComplete, unmarkActivityAsComplete } from '@services/courses/activity';
import FixedActivitySecondaryBar from '@components/Pages/Activity/FixedActivitySecondaryBar';
import type { Activity, Chapter, CourseStructure } from '@components/Contexts/CourseContext';
import ActivityChapterDropdown from '@components/Pages/Activity/ActivityChapterDropdown';
import { AssignmentProvider } from '@components/Contexts/Assignments/AssignmentContext';
import { ActivityAIChatProvider } from '@components/Contexts/AI/ActivityAIChatContext';
import { useSession } from '@/hooks/useSession';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { Suspense, lazy, useEffect, useRef, useState, useTransition } from 'react';
import ActivityBreadcrumbs from '@components/Pages/Activity/ActivityBreadcrumbs';
import ActivityIndicators from '@components/Pages/Courses/ActivityIndicators';
import CourseEndView from '@components/Pages/Activity/CourseEndView';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { CourseProvider } from '@components/Contexts/CourseContext';
import { useActivityAssignmentUuid } from '@/features/courses/hooks/useCourseQueries';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { submitAssessment } from '@services/grading/grading';
import { useGamificationStore } from '@/stores/gamification';
import { useMySubmission } from '@/hooks/useMySubmission';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';
import { getAbsoluteUrl } from '@services/config/config';
import { useQueryClient } from '@tanstack/react-query';
import UserAvatar from '@components/Objects/UserAvatar';
import { AnimatePresence, motion } from 'motion/react';
import NextImage from '@components/ui/NextImage';
import { useRouter } from 'next/navigation';
import Link from '@components/ui/AppLink';
import { toast } from 'sonner';

// Lazy load heavy components
const Canva = lazy(() =>
  import('@components/Objects/Editor/views/InteractiveViewer').then((m) => ({ default: m.InteractiveViewer })),
);
const VideoActivity = lazy(() => import('@components/Objects/Activities/Video/Video'));
const DocumentPdfActivity = lazy(() => import('@components/Objects/Activities/DocumentPdf/DocumentPdf'));
const AssignmentStudentActivity = lazy(
  () => import('@components/Objects/Activities/Assignment/AssignmentStudentActivity'),
);
const ExamActivity = lazy(() => import('@components/Activities/ExamActivity/ExamActivity'));
const CodeChallengeActivity = lazy(() => import('@components/Objects/Activities/CodeChallenge/CodeChallengeActivity'));
const AIActivityAsk = lazy(() => import('@components/Objects/Activities/AI/AIActivityAsk'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex h-64 items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

// AlertDialog helper for submit assignment
interface SubmitAssignmentDialogProps {
  onSubmit: () => Promise<void> | void;
  t: (key: string) => string;
}

function SubmitAssignmentDialog({ onSubmit, t }: SubmitAssignmentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(async () => {
      await onSubmit();
      setIsOpen(false);
    });
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        nativeButton={false}
        render={
          <div className="border-border text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors">
            <BookOpenCheck size={15} />
            <span>{t('assignmentActions.submitForGrading')}</span>
          </div>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Info className="text-primary size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('assignmentActions.submitYourAssingmentForGrading')}</AlertDialogTitle>
          <AlertDialogDescription>{t('assignmentActions.submitConfirm')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('assignmentActions.submit')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ActivityClientProps {
  activityid: string;
  courseuuid: string;
  activity: Activity | null;
  course: CourseStructure;
}

interface ActivityActionsProps {
  activity: Activity | null;
  activityid: string;
  course: CourseStructure;
  assignment: { assignment_uuid: string } | null;
  showNavigation?: boolean;
}

// Custom hook for activity position
function useActivityPosition(course: CourseStructure, activityId: string) {
  const allActivities: (Activity & { cleanUuid?: string; chapterName?: string })[] = [];
  let currentIndex = -1;

  course.chapters.forEach((chapter: Chapter) => {
    chapter.activities?.forEach((activity: Activity) => {
      const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
      allActivities.push({
        ...activity,
        cleanUuid: cleanActivityUuid,
        chapterName: chapter.name,
      });

      if (cleanActivityUuid === activityId.replace('activity_', '')) {
        currentIndex = allActivities.length - 1;
      }
    });
  });

  return { allActivities, currentIndex };
}

const ActivityActions = ({ activity, activityid, course, assignment, showNavigation = true }: ActivityActionsProps) => {
  const t = useTranslations('ActivityPage');
  const { contributorStatus } = useContributorStatus(course.course_uuid);
  const { isAuthenticated } = useSession();

  const { data: trailData } = useTrailCurrent();

  return (
    <div className="flex items-center space-x-2">
      {activity && (activity.published === true || contributorStatus === 'ACTIVE') && isAuthenticated ? (
        <>
          {activity.activity_type !== 'TYPE_ASSIGNMENT' && (
            <MarkStatus
              activity={activity}
              activityid={activityid}
              course={course}
              trailData={trailData}
              t={t}
            />
          )}
          {activity.activity_type === 'TYPE_ASSIGNMENT' && assignment?.assignment_uuid ? (
            <AssignmentTools
              assignment={assignment}
              activity={activity}
              activityid={activityid}
              course={course}
              t={t}
            />
          ) : null}
          {showNavigation ? (
            <NextActivityButton
              course={course}
              currentActivityId={activity.id}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
};

// Helper to ensure Tiptap always receives a valid document
function getValidTiptapContent(content: any): any {
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      // not valid JSON, fall through to return empty doc
    }
  }
  if (content && typeof content === 'object' && content.type === 'doc' && Array.isArray(content.content)) {
    return content;
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

const ActivityClient = (props: ActivityClientProps) => {
  const { activityid } = props;
  const { courseuuid } = props;
  const { activity } = props;
  const { course } = props;
  const { isAuthenticated } = useSession();
  const [isFocusMode, setIsFocusMode] = useState(() => {
    if (typeof globalThis.window !== 'undefined') {
      const saved = localStorage.getItem('globalFocusMode');
      return saved === 'true';
    }
    return false;
  });

  // Track whether focus mode was auto-initiated (e.g., by starting a quiz) so we can hide manual toggles
  const [isAutoFocusInitiated, setIsAutoFocusInitiated] = useState(() => {
    try {
      return typeof globalThis.window !== 'undefined' && localStorage.getItem('globalFocusModeInitiated') === 'true';
    } catch {
      return false;
    }
  });

  const [isInitialRender, setIsInitialRender] = useState(true);
  const { contributorStatus } = useContributorStatus(courseuuid);
  const router = useRouter();
  const t = useTranslations('ActivityPage');
  const locale = useLocale();
  const format = useFormatter();

  const bgColor = (() => {
    if (!activity) return 'bg-background';
    if (activity.activity_type === 'TYPE_DYNAMIC' || activity.activity_type === 'TYPE_ASSIGNMENT') {
      return 'bg-card';
    }
    return 'bg-background';
  })();

  // Helper to get relative time using next-intl
  const getRelativeTimeIntl = (date: Date) => {
    const now = new Date();
    return format.relativeTime(date, now);
  };

  const { data: trailData } = useTrailCurrent();
  const { data: assignmentUuid, isPending: isAssignmentLoading } = useActivityAssignmentUuid(activity?.activity_uuid, {
    enabled: activity?.activity_type === 'TYPE_ASSIGNMENT',
  });
  const assignment = assignmentUuid ? { assignment_uuid: assignmentUuid } : null;

  const { allActivities, currentIndex } = useActivityPosition(course, activityid);

  // Get previous and next activities
  const prevActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  const nextActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;

  const activityContent = (() => {
    // If no activity is provided, nothing to render
    if (!activity) {
      return null;
    }

    // Allow teachers (ACTIVE contributors) to view content even when unpublished
    if (!activity?.published && contributorStatus !== 'ACTIVE') {
      return null;
    }

    switch (activity.activity_type) {
      case 'TYPE_DYNAMIC': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Canva
              content={getValidTiptapContent(activity.content)}
              activity={activity}
            />
          </Suspense>
        );
      }
      case 'TYPE_VIDEO': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <VideoActivity
              course={course}
              activity={activity as any}
            />
          </Suspense>
        );
      }
      case 'TYPE_DOCUMENT': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <DocumentPdfActivity
              course={course}
              activity={activity}
            />
          </Suspense>
        );
      }
      case 'TYPE_ASSIGNMENT': {
        if (isAssignmentLoading) {
          return <LoadingFallback />;
        }

        return assignment?.assignment_uuid ? (
          <Suspense fallback={<LoadingFallback />}>
            <AssignmentProvider assignment_uuid={assignment.assignment_uuid}>
              <AssignmentsTaskProvider>
                <AssignmentStudentActivity />
              </AssignmentsTaskProvider>
            </AssignmentProvider>
          </Suspense>
        ) : null;
      }
      case 'TYPE_EXAM': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ExamActivity
              activity={activity as any}
              course={course}
            />
          </Suspense>
        );
      }
      case 'TYPE_CODE_CHALLENGE': {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <CodeChallengeActivity
              activity={activity}
              course={course}
            />
          </Suspense>
        );
      }
      default: {
        return null;
      }
    }
  })();

  // Navigate to an activity
  const navigateToActivity = (activityToNavigate: any) => {
    if (!activityToNavigate) return;

    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${activityToNavigate.cleanUuid}`);
  };

  // Save focus mode to localStorage when it changes
  const initialRenderRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof globalThis.window !== 'undefined') {
      localStorage.setItem('globalFocusMode', isFocusMode.toString());
      // Dispatch custom event for focus mode change
      globalThis.dispatchEvent(
        new CustomEvent('focusModeChange', {
          detail: { isFocusMode },
        }),
      );
      // Mark as no longer initial render after first change
      if (isInitialRender) {
        if (initialRenderRafRef.current) cancelAnimationFrame(initialRenderRafRef.current);
        initialRenderRafRef.current = requestAnimationFrame(() => setIsInitialRender(false));
        return () => {
          if (initialRenderRafRef.current) cancelAnimationFrame(initialRenderRafRef.current);
        };
      }
    }
    return;
  }, [isFocusMode, isInitialRender]);

  // Listen for the auto-initiated flag to hide manual toggles immediately
  useEffect(() => {
    const handler = () => {
      try {
        setIsAutoFocusInitiated(localStorage.getItem('globalFocusModeInitiated') === 'true');
      } catch {
        setIsAutoFocusInitiated(false);
      }
    };

    globalThis.addEventListener('focusModeChange', handler as EventListener);
    globalThis.addEventListener('storage', handler);

    // Run once to initialize
    handler();

    return () => {
      globalThis.removeEventListener('focusModeChange', handler as EventListener);
      globalThis.removeEventListener('storage', handler);
    };
  }, []);

  const getChapterNameByActivityId = (courseData: any, activity_id: number) => {
    for (let i = 0; i < courseData.chapters.length; i += 1) {
      const chapter = courseData.chapters[i];
      for (let j = 0; j < chapter.activities.length; j += 1) {
        const activityItem = chapter.activities[j];
        if (activityItem.id === activity_id) {
          return `${t('chapter')} ${i + 1} : ${chapter.name}`;
        }
      }
    }
    return null;
  };

  // Focus mode progress
  const focusTotalCount =
    course.chapters?.reduce((acc: number, chapter: any) => acc + (chapter.activities?.length ?? 0), 0) ?? 0;
  const focusCompletedCount =
    trailData?.runs
      ?.find((run: any) => run.course_uuid === course.course_uuid)
      ?.steps?.filter((step: any) => step.complete)?.length ?? 0;
  const focusPercent = focusTotalCount > 0 ? Math.round((focusCompletedCount / focusTotalCount) * 100) : 0;

  return (
    <CourseProvider courseuuid={course?.course_uuid}>
      <Suspense fallback={<LoadingFallback />}>
        <ActivityAIChatProvider activityUuid={activity?.activity_uuid ?? ''}>
          {isFocusMode ? (
            <AnimatePresence>
              <motion.div
                initial={isInitialRender ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-background fixed inset-0 z-50 overflow-hidden"
              >
                {/* Focus Mode Top Bar */}
                <motion.div
                  initial={isInitialRender ? false : { y: -60 }}
                  animate={{ y: 0 }}
                  exit={{ y: -60 }}
                  transition={{ duration: 0.2 }}
                  className="border-border bg-background/95 fixed top-0 right-0 left-0 z-50 border-b backdrop-blur-lg"
                >
                  <div className="container mx-auto px-4">
                    <div className="flex h-14 items-center justify-between gap-4">
                      {/* Left: progress */}
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs font-medium tabular-nums">
                          {focusCompletedCount} / {focusTotalCount}
                        </span>
                        <div className="bg-muted hidden h-1 w-24 overflow-hidden rounded-full sm:block">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-300"
                            style={{ width: `${focusPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Center: course info */}
                      <div className="flex min-w-0 items-center gap-3">
                        <Link
                          prefetch={false}
                          href={`${getAbsoluteUrl('')}/course/${courseuuid}`}
                        >
                          <div className="relative h-7 w-[50px] shrink-0 overflow-hidden rounded">
                            <NextImage
                              src={
                                course.thumbnail_image
                                  ? `${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}`
                                  : '/empty_thumbnail.webp'
                              }
                              alt={course.name || ''}
                              fill
                              className="object-cover"
                              sizes="60px"
                            />
                          </div>
                        </Link>
                        <p className="text-foreground hidden truncate text-sm font-semibold sm:block">{course.name}</p>
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-2">
                        <ActivityChapterDropdown
                          course={course}
                          currentActivityId={
                            activity?.activity_uuid
                              ? activity.activity_uuid.replace('activity_', '')
                              : activityid.replace('activity_', '')
                          }
                          trailData={trailData}
                        />
                        <button
                          onClick={() => {
                            setIsFocusMode(false);
                          }}
                          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                          title={t('exitFocusMode')}
                        >
                          <Minimize2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Focus Mode Content */}
                <div className="h-full overflow-auto pt-14 pb-[57px]">
                  <div className="container mx-auto px-4 py-6">
                    {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                      <div className={`rounded-lg p-7 ${bgColor}`}>{activityContent}</div>
                    ) : null}
                  </div>
                </div>

                {/* Focus Mode Bottom Bar */}
                {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                  <motion.div
                    initial={isInitialRender ? false : { y: 60 }}
                    animate={{ y: 0 }}
                    exit={{ y: 60 }}
                    transition={{ duration: 0.2 }}
                    className="border-border bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg"
                  >
                    <div className="container mx-auto px-4">
                      <div className="flex h-[57px] items-center gap-4">
                        <button
                          onClick={() => {
                            navigateToActivity(prevActivity);
                          }}
                          disabled={!prevActivity}
                          className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ChevronLeft size={15} />
                          <div className="hidden flex-col items-start sm:flex">
                            <span className="text-muted-foreground text-xs">{t('previous')}</span>
                            <span className="text-foreground max-w-[140px] truncate text-left text-xs font-medium">
                              {prevActivity?.name ?? ''}
                            </span>
                          </div>
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                          <ActivityActions
                            activity={activity}
                            activityid={activityid}
                            course={course}
                            assignment={assignment}
                            showNavigation={false}
                          />
                        </div>

                        <button
                          onClick={() => {
                            navigateToActivity(nextActivity);
                          }}
                          disabled={!nextActivity}
                          className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30"
                        >
                          <div className="hidden flex-col items-end sm:flex">
                            <span className="text-muted-foreground text-xs">{t('next')}</span>
                            <span className="text-foreground max-w-[140px] truncate text-right text-xs font-medium">
                              {nextActivity?.name ?? ''}
                            </span>
                          </div>
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          ) : (
            <GeneralWrapper>
              {/* Original non-focus mode UI */}
              {activityid === 'end' ? (
                <CourseEndView
                  courseName={course.name ?? ''}
                  courseUuid={course.course_uuid}
                  thumbnailImage={course.thumbnail_image ?? ''}
                  course={course}
                  trailData={trailData}
                />
              ) : (
                <div className="space-y-4 pt-0">
                  <div className="pt-2">
                    <ActivityBreadcrumbs
                      course={course}
                      activity={activity}
                    />
                    <div className="activity-info-section space-y-4 pb-6">
                      {/* Top row: course thumbnail + activity title + actions */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                          <Link
                            prefetch={false}
                            href={`${getAbsoluteUrl('')}/course/${courseuuid}`}
                          >
                            <div className="border-border relative h-12 w-[84px] shrink-0 overflow-hidden rounded-md border">
                              <NextImage
                                src={
                                  course.thumbnail_image
                                    ? `${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}`
                                    : '/empty_thumbnail.webp'
                                }
                                alt={course.name || ''}
                                fill
                                className="object-cover"
                                sizes="100px"
                              />
                            </div>
                          </Link>
                          <div className="min-w-0">
                            <h1 className="text-foreground mt-0.5 text-2xl font-semibold tracking-tight">
                              {activity?.name || ''}
                            </h1>
                            <p className="text-muted-foreground mt-0.5 text-sm">
                              {activity ? getChapterNameByActivityId(course, activity.id) : ''}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="ml-auto flex items-center gap-2">
                          {activity &&
                          (activity.published === true || contributorStatus === 'ACTIVE') &&
                          isAuthenticated ? (
                            <>
                              {activity.activity_type !== 'TYPE_ASSIGNMENT' && (
                                <>
                                  <AIActivityAsk activity={activity} />
                                  <ActivityChapterDropdown
                                    course={course}
                                    currentActivityId={
                                      activity.activity_uuid
                                        ? activity.activity_uuid.replace('activity_', '')
                                        : activityid.replace('activity_', '')
                                    }
                                    trailData={trailData}
                                  />
                                  {contributorStatus === 'ACTIVE' && activity.activity_type === 'TYPE_DYNAMIC' && (
                                    <Link
                                      prefetch={false}
                                      href={`${getAbsoluteUrl('')}/course/${courseuuid}/activity/${activityid}/edit`}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                                    >
                                      <Edit2 size={13} />
                                      {t('contribute')}
                                    </Link>
                                  )}
                                </>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>

                      {/* Authors and dates row */}
                      {(course.authors && course.authors.length > 0) || course.creation_date ? (
                        <div className="flex flex-wrap items-center gap-3">
                          {course.authors && course.authors.length > 0 ? (
                            <>
                              <div className="flex -space-x-2">
                                {course.authors
                                  .filter((a: any) => a.authorship_status === 'ACTIVE')
                                  .slice(0, 3)
                                  .map((author: any, _idx: number) => (
                                    <div
                                      key={author.user.user_uuid}
                                      style={{ zIndex: 10 - _idx }}
                                      className="relative"
                                    >
                                      <UserAvatar
                                        size="sm"
                                        variant="outline"
                                        avatar_url={
                                          author.user.avatar_image && author.user.user_uuid
                                            ? getUserAvatarMediaDirectory(
                                                author.user.user_uuid,
                                                author.user.avatar_image,
                                              )
                                            : ''
                                        }
                                        predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
                                        showProfilePopup
                                        userId={author.user.id}
                                      />
                                    </div>
                                  ))}
                                {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length > 3 && (
                                  <div className="bg-muted text-muted-foreground border-background relative z-0 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium">
                                    +{course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length - 3}
                                  </div>
                                )}
                              </div>
                              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                                {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length > 1 && (
                                  <span>{t('coCreatedBy')} </span>
                                )}
                                {course.authors
                                  .filter((a: any) => a.authorship_status === 'ACTIVE')
                                  .slice(0, 2)
                                  .map((author: any, idx: number, arr: any[]) => (
                                    <span key={author.user.user_uuid}>
                                      {author.user.first_name && author.user.last_name
                                        ? [author.user.first_name, author.user.middle_name, author.user.last_name]
                                            .filter(Boolean)
                                            .join(' ')
                                        : `@${author.user.username}`}
                                      {idx === 0 && arr.length > 1 ? ' & ' : ''}
                                    </span>
                                  ))}
                                {course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length > 2 && (
                                  <ToolTip
                                    content={
                                      <div className="p-2">
                                        {course.authors
                                          .filter((a: any) => a.authorship_status === 'ACTIVE')
                                          .slice(2)
                                          .map((author: any) => (
                                            <div
                                              key={author.user.user_uuid}
                                              className="py-1 text-sm text-white"
                                            >
                                              {author.user.first_name && author.user.last_name
                                                ? [
                                                    author.user.first_name,
                                                    author.user.middle_name,
                                                    author.user.last_name,
                                                  ]
                                                    .filter(Boolean)
                                                    .join(' ')
                                                : `@${author.user.username}`}
                                            </div>
                                          ))}
                                      </div>
                                    }
                                  >
                                    <span className="hover:bg-muted text-muted-foreground cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium transition-colors">
                                      +{course.authors.filter((a: any) => a.authorship_status === 'ACTIVE').length - 2}
                                    </span>
                                  </ToolTip>
                                )}
                              </div>
                            </>
                          ) : null}
                          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <span>
                              {t('createdOn')}{' '}
                              {new Date(course.creation_date).toLocaleDateString(locale, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </span>
                            <span>·</span>
                            <span>
                              {t('lastUpdated')}{' '}
                              {getRelativeTimeIntl(
                                new Date(course.updated_at || course.last_updated || course.creation_date),
                              )}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {/* Progress indicators */}
                      <ActivityIndicators
                        course_uuid={courseuuid}
                        current_activity={activityid}
                        course={course}
                        enableNavigation
                        trailData={trailData}
                      />
                    </div>

                    {activity && activity.published === false && contributorStatus !== 'ACTIVE' ? (
                      <div className="border-border bg-muted/30 rounded-lg border p-7">
                        <p className="text-muted-foreground text-sm font-medium">{t('activityNotPublished')}</p>
                      </div>
                    ) : null}

                    {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                      <div className={`border-border relative rounded-lg border p-7 ${bgColor}`}>
                        {!isAutoFocusInitiated && (
                          <button
                            onClick={() => {
                              setIsFocusMode(true);
                            }}
                            className="border-border bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground absolute top-3 right-3 z-50 flex h-8 items-center gap-1.5 rounded-md border px-2.5 backdrop-blur-sm transition-colors"
                            title={t('enterFocusMode')}
                          >
                            <Maximize2 size={12} />
                            <span className="hidden text-xs font-medium sm:inline">{t('focusMode')}</span>
                          </button>
                        )}
                        {activityContent}
                      </div>
                    ) : null}

                    {/* Activity Actions below the content box */}
                    {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                      <div className="mt-4 flex w-full items-center justify-between">
                        <PreviousActivityButton
                          course={course}
                          currentActivityId={activity.id}
                        />
                        <div className="flex items-center gap-2">
                          <ActivityActions
                            activity={activity}
                            activityid={activityid}
                            course={course}
                            assignment={assignment}
                            showNavigation={false}
                          />
                          <NextActivityButton
                            course={course}
                            currentActivityId={activity.id}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Fixed Activity Secondary Bar */}
                    {activity && (activity.published === true || contributorStatus === 'ACTIVE') ? (
                      <FixedActivitySecondaryBar
                        course={course}
                        currentActivityId={activityid}
                        activity={activity}
                      />
                    ) : null}

                    <div className="h-[100px]" />
                  </div>
                </div>
              )}
            </GeneralWrapper>
          )}
        </ActivityAIChatProvider>
      </Suspense>
    </CourseProvider>
  );
};

export const MarkStatus = (props: {
  activity: any;
  activityid: string;
  course: any;
  trailData: any;
  t: ReturnType<typeof useTranslations<'ActivityPage'>>;
}) => {
  const { t } = props;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const refetchGamification = useGamificationStore((s) => s.refetch);

  // Track completed activities to prevent duplicate XP toasts
  const completedActivitiesRef = useRef(new Set());

  const areAllActivitiesCompleted = () => {
    const run = props.trailData?.runs?.find((run: any) => run.course_uuid === props.course.course_uuid);
    if (!run) return false;

    let totalActivities = 0;
    let completedActivities = 0;

    props.course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((activity: any) => {
        totalActivities += 1;
        const isCompleted = run.steps.find(
          (step: any) => step.activity_uuid === activity.activity_uuid && step.complete === true,
        );
        if (isCompleted) {
          completedActivities += 1;
        }
      });
    });

    return completedActivities >= totalActivities - 1;
  };

  const markActivityAsCompleteFront = async () => {
    try {
      const willCompleteAll = areAllActivitiesCompleted();
      setIsLoading(true);

      await markActivityAsComplete(props.activity.activity_uuid);

      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });

      // Show XP feedback and update profile
      if (useGamificationStore.getState().profile) {
        // Only show XP toast if we haven't already shown it for this activity
        const activityKey = `${props.activity.id}`;
        if (!completedActivitiesRef.current.has(activityKey)) {
          completedActivitiesRef.current.add(activityKey);
          useGamificationStore.getState().showXPToast(25, 'activity_completion');
        }
        // Refetch in background to update profile with actual XP from backend
        refetchGamification().catch((error: unknown) => console.error('Failed to refetch gamification:', error));
      } else {
        // Fallback for non-gamified orgs
        toast.success(t('activityCompleted'));
      }

      if (willCompleteAll) {
        const cleanCourseUuid = props.course.course_uuid.replace('course_', '');
        router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/end`);
      }
    } catch (error) {
      console.error('Error marking activity as complete:', error);
      toast.error(t('markCompleteError'));
    } finally {
      setIsLoading(false);
    }
  };

  const unmarkActivityAsCompleteFront = async () => {
    try {
      setIsLoading(true);
      await unmarkActivityAsComplete(props.activity.activity_uuid);

      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
    } catch {
      toast.error(t('unmarkCompleteError'));
    } finally {
      setIsLoading(false);
    }
  };

  const isActivityCompleted = (() => {
    // Clean up course UUID by removing 'course_' prefix if it exists
    const cleanCourseUuid = props.course.course_uuid?.replace('course_', '');

    const run = props.trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    });

    if (run) {
      // Find the step that matches the current activity
      return run.steps.find((step: any) => step.activity_id === props.activity.id && step.complete === true);
    }
    return false;
  })();

  // Don't render until we have trail data
  if (!props.trailData) {
    return null;
  }

  return (
    <>
      {isActivityCompleted ? (
        <button
          type="button"
          onClick={!isLoading ? unmarkActivityAsCompleteFront : undefined}
          disabled={isLoading}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle size={14} />}
          {isLoading ? t('marking') : t('statusComplete')}
        </button>
      ) : (
        <button
          type="button"
          onClick={!isLoading ? markActivityAsCompleteFront : undefined}
          disabled={isLoading}
          className="border-border bg-background text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Circle size={14} />}
          {isLoading ? t('marking') : t('markAsComplete')}
        </button>
      )}
    </>
  );
};

const NextActivityButton = ({ course, currentActivityId }: { course: CourseStructure; currentActivityId: number }) => {
  const router = useRouter();
  const t = useTranslations('ActivityPage');

  const nextActivity = (() => {
    const allActivities: (Activity & { cleanUuid?: string; chapterName?: string })[] = [];
    let currentIndex = -1;

    // Flatten all activities from all chapters
    course.chapters.forEach((chapter: Chapter) => {
      chapter.activities?.forEach((activity: Activity) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
        });

        // Check if this is the current activity
        if (activity.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    // Get next activity
    return currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;
  })();

  function navigateToActivity() {
    if (!nextActivity) return;
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${nextActivity.cleanUuid}`);
  }

  if (!nextActivity) return null;

  return (
    <button
      onClick={navigateToActivity}
      className="bg-muted text-foreground hover:bg-muted/80 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
    >
      <span className="max-w-[180px] truncate">{nextActivity.name}</span>
      <ChevronRight
        size={14}
        className="shrink-0"
      />
    </button>
  );
};

const PreviousActivityButton = ({
  course,
  currentActivityId,
}: {
  course: CourseStructure;
  currentActivityId: number;
}) => {
  const router = useRouter();
  const t = useTranslations('ActivityPage');

  const previousActivity = (() => {
    const allActivities: (Activity & { cleanUuid?: string; chapterName?: string })[] = [];
    let currentIndex = -1;

    // Flatten all activities from all chapters
    course.chapters.forEach((chapter: Chapter) => {
      chapter.activities?.forEach((activity: Activity) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
        });

        // Check if this is the current activity
        if (activity.id === currentActivityId) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    // Get previous activity
    return currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  })();

  function navigateToActivityPrevious() {
    if (!previousActivity) return;
    const cleanCourseUuid = course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${previousActivity.cleanUuid}`);
  }

  if (!previousActivity) return null;

  return (
    <button
      onClick={navigateToActivityPrevious}
      className="border-border bg-background text-foreground hover:bg-muted inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
    >
      <ChevronLeft
        size={14}
        className="shrink-0"
      />
      <span className="max-w-[180px] truncate">{previousActivity.name}</span>
    </button>
  );
};

const AssignmentTools = (props: {
  activity: any;
  activityid: string;
  course: any;
  assignment: any;
  t: ReturnType<typeof useTranslations<'ActivityPage'>>;
}) => {
  const { t } = props;

  // Use the unified grading endpoint instead of the legacy AssignmentSubmissionContext
  const { submission, mutate: mutateSubmission } = useMySubmission(props.activity?.id ?? null);

  async function submitForGradingUI() {
    if (!props.activity?.id) return;
    try {
      await submitAssessment(props.activity.id, 'ASSIGNMENT', {}, 0);
      toast.success(t('submitSuccessToast'));
      await mutateSubmission();
    } catch {
      toast.error(t('submitErrorToast'));
    }
  }

  if (!submission) {
    return (
      <SubmitAssignmentDialog
        onSubmit={submitForGradingUI}
        t={t}
      />
    );
  }

  if (submission.status === 'DRAFT' || submission.status === 'RETURNED') {
    return (
      <SubmitAssignmentDialog
        onSubmit={submitForGradingUI}
        t={t}
      />
    );
  }

  if (submission.status === 'PENDING') {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
        <UserRoundPen size={14} />
        <span>{t('assignmentStatus.grading')}</span>
      </div>
    );
  }

  if (submission.status === 'GRADED' || submission.status === 'PUBLISHED') {
    const displayScore =
      submission.final_score !== null && submission.final_score !== undefined ? `${submission.final_score}%` : null;

    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
        <CheckCircle size={14} />
        <span>{t('assignmentStatus.graded')}</span>
        {displayScore && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
            {displayScore}
          </span>
        )}
      </div>
    );
  }

  // Handles any unknown future statuses conservatively by leaving no action visible.
  return null;
};

export default ActivityClient;
