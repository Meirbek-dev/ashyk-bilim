'use client';

import {
  AlertTriangle,
  BookMinus,
  Calendar,
  Crown,
  FilePenLine,
  Loader2,
  MoreVertical,
  Play,
  Settings2,
} from 'lucide-react';
import { buildCourseWorkspacePath } from '@/lib/course-management';
import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { FC } from 'react';
import { toast } from 'sonner';

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
import { ResourceActionsMenu } from '@/components/Utils/ResourceActionsMenu';
import type { ResourceAction } from '@/components/Utils/ResourceActionsMenu';
import { useSession } from '@/hooks/useSession';
import { Card, CardContent, CardFooter } from '@components/ui/card';
import { Resources, Actions, Scopes } from '@/types/permissions';
import UserAvatar from '@components/Objects/UserAvatar';
import NextImage from '@components/ui/NextImage';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import Link from '@components/ui/AppLink';

import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media';
import { deleteCourseFromBackend } from '@services/courses/courses';
import { getAbsoluteUrl } from '@services/config/config';

// ============================================================================
// Types
// ============================================================================

export interface CourseAuthor {
  user: {
    id: number;
    user_uuid: string;
    avatar_image: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    username: string;
  };
  authorship: 'CREATOR' | 'CONTRIBUTOR' | 'MAINTAINER' | 'REPORTER';
  authorship_status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
}

export interface Course {
  course_uuid: string;
  name: string;
  description: string;
  thumbnail_image: string;
  update_date: string;
  authors?: CourseAuthor[];
  chapters?: {
    activities: any[];
  }[];
  can_update?: boolean;
  can_delete?: boolean;
  can_manage_contributors?: boolean;
  is_owner?: boolean;
}

export interface CourseThumbnailProps {
  course: Course;
  customLink?: string;
  actionLink?: string;
  trailData?: any;
  trailLoading?: boolean;
  /** Set to true for above-the-fold cards to eager-load the thumbnail (fixes LCP) */
  priority?: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

const removeCoursePrefix = (courseUuid: string): string => courseUuid.replace('course_', '');

const getAuthorFullName = (author: CourseAuthor['user']): string =>
  [author.first_name, author.middle_name, author.last_name].filter(Boolean).join(' ');

const formatDate = (dateString: string, locale: string): string => {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

// ============================================================================
// Sub-components
// ============================================================================

interface CourseImageProps {
  thumbnailUrl: string;
  courseName: string;
  updateDate: string;
  locale: string;
  courseUrl: string;
  t: any;
  isOwner?: boolean;
  priority?: boolean;
}

const CourseImage: FC<CourseImageProps> = ({
  thumbnailUrl,
  courseName,
  updateDate,
  locale,
  courseUrl,
  t,
  isOwner = false,
  priority = false,
}) => (
  <Link
    prefetch={false}
    href={courseUrl}
    className="relative block overflow-hidden"
    aria-label={t('openCourse', { course: courseName })}
  >
    <div className="bg-muted relative aspect-video w-full overflow-hidden">
      <NextImage
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        src={thumbnailUrl}
        alt={courseName}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        priority={priority}
      />

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"
        aria-hidden="true"
      />

      {isOwner && (
        <Badge
          variant="default"
          className="absolute top-2.5 left-2.5 gap-1 text-xs backdrop-blur-sm"
          aria-hidden="true"
        >
          <Crown className="h-3 w-3" />
          {t('ownerBadge')}
        </Badge>
      )}

      {updateDate && (
        <Badge
          variant="secondary"
          className="bg-background/80 absolute right-2.5 bottom-2.5 text-[11px] backdrop-blur-sm"
          aria-hidden="true"
        >
          <Calendar className="mr-1 h-3 w-3" />
          {formatDate(updateDate, locale)}
        </Badge>
      )}
    </div>
  </Link>
);

interface AuthorsDisplayProps {
  authors: CourseAuthor[];
  t: any;
}

const AuthorsDisplay: FC<AuthorsDisplayProps> = ({ authors, t }) => {
  // LMS Best Practice: Sort authors so CREATORs/Main instructors appear first.
  const sortedAuthors = useMemo(() => {
    return [...authors].toSorted((a, b) => {
      if (a.authorship === 'CREATOR' && b.authorship !== 'CREATOR') return -1;
      if (b.authorship === 'CREATOR' && a.authorship !== 'CREATOR') return 1;
      return 0;
    });
  }, [authors]);

  const displayedAuthors = sortedAuthors.slice(0, 3);
  const hasMoreAuthors = sortedAuthors.length > 3;
  const remainingCount = sortedAuthors.length - 3;

  const authorsText = useMemo(() => {
    const names = displayedAuthors.map((a) => {
      const fullName = getAuthorFullName(a.user);
      return fullName.trim() !== '' ? fullName : a.user.username;
    });

    const joinedNames = names.join(', ');
    return hasMoreAuthors ? `${joinedNames} +${remainingCount}` : joinedNames;
  }, [displayedAuthors, hasMoreAuthors, remainingCount]);

  if (authors.length === 0) return null;

  return (
    <div className="flex items-center gap-3 pt-2">
      {/* Overlapping Avatars */}
      <div
        className="flex items-center -space-x-2"
        role="group"
        aria-label={t('courseAuthorsAria', { defaultValue: 'Course authors' })}
      >
        {displayedAuthors.map((author, idx) => {
          const authorName = getAuthorFullName(author.user).trim() || author.user.username;
          // Format role for tooltip (e.g., "CREATOR" -> "Creator")
          const roleLabel = author.authorship.charAt(0) + author.authorship.slice(1).toLowerCase();
          const isCreator = author.authorship === 'CREATOR';

          return (
            <div
              key={author.user.user_uuid}
              className={`ring-background relative rounded-full ring-2 transition-all duration-200 hover:z-20 hover:-translate-y-0.5 hover:shadow-sm ${
                isCreator ? 'ring-primary/10' : ''
              }`}
              style={{ zIndex: displayedAuthors.length - idx }}
              title={`${authorName} (${roleLabel})`}
            >
              <UserAvatar
                size="sm"
                variant="outline"
                avatar_url={
                  author.user.avatar_image
                    ? getUserAvatarMediaDirectory(author.user.user_uuid, author.user.avatar_image)
                    : ''
                }
                predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
                showProfilePopup
                userId={author.user.id}
              />
            </div>
          );
        })}

        {hasMoreAuthors && (
          <div
            className="bg-muted text-muted-foreground ring-background flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 transition-transform hover:z-20 hover:scale-105"
            title={t('moreAuthors', {
              count: remainingCount,
              defaultValue: `${remainingCount} more contributors`,
            })}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {/* Author Names & LMS Role Context */}
      <div className="flex min-w-0 flex-col justify-center">
        <span className="text-muted-foreground/70 mb-0.5 text-[10px] font-semibold tracking-wider uppercase">
          {/* You can replace this with t('instructor') depending on your translation keys */}
          {t('instructorLabel', { defaultValue: 'Instructor' })}
        </span>
        <span
          className="text-foreground/90 hover:text-foreground truncate text-xs leading-none font-medium transition-colors"
          aria-label={authorsText}
          title={authorsText}
        >
          {authorsText}
        </span>
      </div>
    </div>
  );
};

interface ProgressBarProps {
  percentage: number;
  courseName: string;
  t: any;
}

const ProgressBar: FC<ProgressBarProps> = ({ percentage, courseName, t }) => (
  <div className="flex items-center gap-2.5">
    <div
      className="bg-primary/15 h-1.5 flex-1 overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      aria-label={t('progressBarAria', { course: courseName })}
    >
      <div
        className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
    <span className="text-muted-foreground text-xs tabular-nums">{percentage}%</span>
  </div>
);

interface CourseActionsProps {
  isEnrolled: boolean;
  isLoading: boolean;
  progressPercentage: number;
  courseUrl: string;
  courseName: string;
  t: any;
}

const CourseActions: FC<CourseActionsProps> = ({
  isEnrolled,
  isLoading,
  progressPercentage,
  courseUrl,
  courseName,
  t,
}) => {
  if (isLoading) {
    return (
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="bg-muted-foreground/20 h-full w-2/5 animate-pulse rounded-full" />
          </div>
          <span className="text-muted-foreground/50 text-xs">…</span>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled
          aria-disabled
        >
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          {t('loading', { defaultValue: 'Loading…' })}
        </Button>
      </div>
    );
  }

  if (isEnrolled) {
    return (
      <div className="w-full space-y-2">
        <ProgressBar
          percentage={progressPercentage}
          courseName={courseName}
          t={t}
        />
        <Button
          nativeButton={false}
          render={
            <Link
              prefetch={false}
              href={courseUrl}
            />
          }
          aria-label={t('continueLearning', {
            defaultValue: 'Continue Learning',
          })}
          size="sm"
          className="w-full"
        >
          <Play className="mr-2 h-3.5 w-3.5" />
          {t('continueLearning', { defaultValue: 'Continue Learning' })}
        </Button>
      </div>
    );
  }

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          prefetch={false}
          href={courseUrl}
        />
      }
      aria-label={t('startLearning')}
      size="sm"
      variant="outline"
      className="w-full"
    >
      <Play className="mr-2 h-3.5 w-3.5" />
      {t('startLearning')}
    </Button>
  );
};

interface AdminMenuProps {
  course: Course;
  onDelete: () => Promise<void>;
}

const AdminMenu: FC<AdminMenuProps> = ({ course, onDelete }) => {
  const t = useTranslations('Components.CourseThumbnail');
  const router = useRouter();
  const { can, user: _thumbnailUser } = useSession();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const currentUserId = _thumbnailUser?.id;

  const isOwner = useMemo(() => {
    if (!currentUserId || !course.authors?.length) return course.is_owner ?? false;
    return course.authors.some(
      (a) =>
        a.authorship_status === 'ACTIVE' &&
        (a.authorship === 'CREATOR' || a.authorship === 'MAINTAINER') &&
        a.user.id === currentUserId,
    );
  }, [currentUserId, course.authors, course.is_owner]);

  const canUpdate =
    can(Resources.COURSE, Actions.UPDATE, Scopes.PLATFORM) ||
    (isOwner && can(Resources.COURSE, Actions.UPDATE, Scopes.OWN));

  const canDelete =
    can(Resources.COURSE, Actions.DELETE, Scopes.PLATFORM) ||
    (isOwner && can(Resources.COURSE, Actions.DELETE, Scopes.OWN));

  const availableActions = [...(canUpdate ? ['update'] : []), ...(canDelete ? ['delete'] : [])];

  const handleDelete = () => {
    startTransition(async () => {
      await onDelete();
      setIsDeleteDialogOpen(false);
    });
  };

  const courseIdClean = removeCoursePrefix(course.course_uuid);

  const actions: ResourceAction[] = [
    {
      id: 'edit-content',
      label: t('editContent'),
      icon: FilePenLine,
      onClick: () => router.push(buildCourseWorkspacePath(courseIdClean, 'curriculum')),
      requiresAction: 'update',
    },
    {
      id: 'settings',
      label: t('settings'),
      icon: Settings2,
      onClick: () => router.push(buildCourseWorkspacePath(courseIdClean, 'details')),
      requiresAction: 'update',
    },
    {
      id: 'delete',
      label: t('delete'),
      icon: BookMinus,
      onClick: () => setIsDeleteDialogOpen(true),
      variant: 'destructive' as const,
      requiresAction: 'delete',
      separator: true,
    },
  ];

  const trigger = (
    <Button
      variant="secondary"
      size="icon"
      className="bg-background/80 hover:bg-background h-8 w-8 rounded-full border-0 shadow-sm backdrop-blur-md transition-all hover:scale-105"
      aria-label={t('courseOptions', { defaultValue: 'Course options' })}
    >
      <MoreVertical className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      <div className="absolute top-2 right-2 z-20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <ResourceActionsMenu
          availableActions={availableActions}
          actions={actions}
          trigger={trigger}
        />
      </div>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
              <AlertTriangle className="size-8" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('deleteConfirmationTitle', { courseName: course.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmationMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {t('deleting')}
                </div>
              ) : (
                t('deleteButtonText')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const CourseThumbnail: FC<CourseThumbnailProps> = ({
  course,
  customLink,
  actionLink,
  trailData,
  trailLoading = false,
  priority = false,
}) => {
  const t = useTranslations('Components.CourseThumbnail');
  const locale = useLocale();
  const router = useRouter();
  const { user: currentUser, isAuthenticated } = useSession();

  // Defensive: never show loading state for unauthenticated users even if
  // the parent accidentally passes trailLoading=true without trail data.
  const effectiveTrailLoading = isAuthenticated && trailLoading;

  const activeAuthors = useMemo(
    () => course.authors?.filter((a) => a.authorship_status === 'ACTIVE') || [],
    [course.authors],
  );

  const cleanCourseUuid = useMemo(() => removeCoursePrefix(course.course_uuid), [course.course_uuid]);

  const courseRun = useMemo(() => {
    return trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    });
  }, [trailData, cleanCourseUuid]);

  const { progressPercentage } = useMemo(() => {
    const total =
      courseRun?.course_total_steps ||
      course.chapters?.reduce((acc, chapter) => acc + chapter.activities.length, 0) ||
      0;
    const completed = courseRun?.steps?.filter((step: any) => step.complete === true)?.length || 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { progressPercentage: percentage };
  }, [courseRun, course.chapters]);

  const thumbnailUrl = useMemo(() => {
    return course.thumbnail_image
      ? getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)
      : '../empty_thumbnail.avif';
  }, [course.thumbnail_image, course.course_uuid]);

  const courseUrl = useMemo(
    () => customLink || getAbsoluteUrl(`/course/${cleanCourseUuid}`),
    [customLink, cleanCourseUuid],
  );

  const actionUrl = useMemo(() => actionLink || courseUrl, [actionLink, courseUrl]);

  const isEnrolled = Boolean(courseRun);
  const titleId = `course-title-${cleanCourseUuid}`;

  const currentUserId = currentUser?.id;
  const isOwner = useMemo(() => {
    if (!currentUserId || !activeAuthors.length) return false;
    return activeAuthors.some((author) => author.authorship === 'CREATOR' && author.user.id === currentUserId);
  }, [currentUserId, activeAuthors]);

  const handleDelete = async () => {
    const toastId = toast.loading(t('deleting'));
    try {
      await deleteCourseFromBackend(course.course_uuid);
      toast.success(t('toastDeleteSuccess'));
      router.refresh();
    } catch {
      toast.error(t('toastDeleteError'));
    } finally {
      toast.dismiss(toastId);
    }
  };

  return (
    <Card
      role="article"
      aria-labelledby={titleId}
      className="group bg-card focus-visible:ring-primary/60 relative flex h-full w-full max-w-sm min-w-[260px] flex-col overflow-hidden rounded-lg border p-0 shadow-sm transition-shadow duration-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      tabIndex={0}
    >
      <AdminMenu
        course={course}
        onDelete={handleDelete}
      />

      <CourseImage
        thumbnailUrl={thumbnailUrl}
        courseName={course.name}
        updateDate={course.update_date}
        locale={locale}
        courseUrl={courseUrl}
        t={t}
        isOwner={isOwner}
        priority={priority}
      />

      <CardContent className="flex flex-1 flex-col gap-1.5 px-4 pt-3 pb-2">
        <div className="flex-1 space-y-1">
          <Link
            prefetch={false}
            href={courseUrl}
            className="group-hover:text-primary block transition-colors duration-150"
            aria-label={t('openCourse', { course: course.name })}
          >
            <h3
              id={titleId}
              className="text-foreground line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight"
            >
              {course.name}
            </h3>
          </Link>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">{course.description}</p>
        </div>

        <AuthorsDisplay
          authors={activeAuthors}
          t={t}
        />
      </CardContent>

      <CardFooter className="bg-muted/20 mt-auto border-t px-4 py-3">
        <CourseActions
          isEnrolled={isEnrolled}
          isLoading={effectiveTrailLoading}
          progressPercentage={progressPercentage}
          courseUrl={actionUrl}
          courseName={course.name}
          t={t}
        />
      </CardFooter>
    </Card>
  );
};

export default CourseThumbnail;
export { removeCoursePrefix };
