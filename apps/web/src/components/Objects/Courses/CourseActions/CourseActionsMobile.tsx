'use client';

import { BookOpen, Loader2, LogIn } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { useState, useTransition } from 'react';
import { revalidateTags } from '@/lib/api-client';
import { startCourse } from '@services/courses/activity';
import { getAbsoluteUrl } from '@services/config/config';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import UserAvatar from '../../UserAvatar';

interface Author {
  user: {
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

interface CourseRun {
  status: string;
  course_id: number;
}

interface Course {
  id: number;
  course_uuid: string;
  authors: Author[];
  trail?: {
    runs: CourseRun[];
  };
  chapters?: {
    name: string;
    activities: {
      id: number;
      activity_uuid: string;
      name: string;
      activity_type: string;
    }[];
  }[];
}

interface CourseActionsMobileProps {
  courseuuid: string;
  course: Course;
  trailData?: any;
}

// Component for displaying multiple authors
const MultipleAuthors = ({ authors }: { authors: Author[] }) => {
  const t = useTranslations('Courses.CourseActionsMobile');

  // Early return if no authors
  if (!authors || authors.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm text-neutral-400">{t('noAuthors')}</div>
      </div>
    );
  }

  const displayedAvatars = authors.slice(0, 3);
  const remainingCount = Math.max(0, authors.length - 3);

  // Avatar size for mobile
  const avatarSize = 36;

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex -space-x-3">
        {displayedAvatars.map((author, index) => (
          <div
            key={author.user.user_uuid}
            className="relative"
            style={{ zIndex: displayedAvatars.length - index }}
          >
            <UserAvatar
              size="sm"
              variant="outline"
              avatar_url={
                author.user.avatar_image && author.user.user_uuid
                  ? getUserAvatarMediaDirectory(author.user.user_uuid, author.user.avatar_image)
                  : ''
              }
              predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
            />
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="relative z-0">
            <div
              className="flex items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-xs font-medium text-neutral-600 shadow-sm"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
              }}
            >
              +{remainingCount}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <span className="text-xs font-medium text-neutral-400">{authors.length > 1 ? t('authors') : t('author')}</span>
        {authors.length === 1 ? (
          <span className="text-sm font-semibold text-neutral-800">
            {authors[0]?.user?.first_name && authors[0]?.user?.last_name
              ? [authors[0].user.first_name, authors[0].user.middle_name, authors[0].user.last_name]
                  .filter(Boolean)
                  .join(' ')
              : `@${authors[0]?.user?.username || 'Unknown'}`}
          </span>
        ) : (
          <span className="text-sm font-semibold text-neutral-800">
            {authors[0]?.user?.first_name && authors[0]?.user?.last_name
              ? [authors[0].user.first_name, authors[0].user.middle_name, authors[0].user.last_name]
                  .filter(Boolean)
                  .join(' ')
              : `@${authors[0]?.user?.username || 'Unknown'}`}
            {authors.length > 1 && ` ${t('moreAuthors', { count: authors.length - 1 })}`}
          </span>
        )}
      </div>
    </div>
  );
};

const CourseActionsMobile = ({ courseuuid, course, trailData }: CourseActionsMobileProps) => {
  const t = useTranslations('Courses.CourseActionsMobile');
  const router = useRouter();
  const { user: currentUser } = useSession();
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Clean up course UUID by removing 'course_' prefix if it exists
  const cleanCourseUuid = course.course_uuid?.replace('course_', '');

  const isStarted =
    trailData?.runs?.find((run: any) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
      return cleanRunCourseUuid === cleanCourseUuid;
    }) ?? false;

  const handleCourseAction = async () => {
    if (!currentUser) {
      router.push(getAbsoluteUrl('/signup'));
      return;
    }

    // If already started, navigate to first unfinished activity
    if (isStarted) {
      const run = trailData?.runs?.find((r: any) => {
        const cleanRunCourseUuid = r.course?.course_uuid?.replace('course_', '');
        return cleanRunCourseUuid === cleanCourseUuid;
      });

      // Find first unfinished activity
      let firstUnfinishedActivity: { id: number; activity_uuid: string } | null = null;

      if (course.chapters) {
        for (const chapter of course.chapters) {
          for (const activity of chapter.activities) {
            const isCompleted = run?.steps?.some((step: any) => step.activity_id === activity.id && step.complete);
            if (!isCompleted) {
              firstUnfinishedActivity = activity;
              break;
            }
          }
          if (firstUnfinishedActivity) break;
        }
      }

      // If all activities are completed, go to first activity
      const targetActivity = firstUnfinishedActivity || course.chapters?.[0]?.activities?.[0];

      if (targetActivity) {
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${targetActivity.activity_uuid.replace('activity_', '')}`,
        );
      }
      return;
    }

    startTransition(() => setIsActionLoading(true));
    try {
      await startCourse(`course_${courseuuid}`);
      await revalidateTags(['courses']);

      // Get the first activity from the first chapter
      const firstChapter = course.chapters?.[0];
      const firstActivity = firstChapter?.activities?.[0];

      if (firstActivity) {
        // Redirect to the first activity
        await revalidateTags(['activities']);
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${firstActivity.activity_uuid.replace('activity_', '')}`,
        );
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to perform course action:', error);
    } finally {
      startTransition(() => setIsActionLoading(false));
      await revalidateTags(['courses']);
    }
  };

  // Filter active authors and sort by role priority
  const sortedAuthors = [...course.authors]
    .filter((author) => author.authorship_status === 'ACTIVE')
    .toSorted((a, b) => {
      const rolePriority: Record<string, number> = {
        CREATOR: 0,
        MAINTAINER: 1,
        CONTRIBUTOR: 2,
        REPORTER: 3,
      };
      const aPriority = rolePriority[a.authorship] ?? 999;
      const bPriority = rolePriority[b.authorship] ?? 999;
      return aPriority - bPriority;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/70 bg-white/90 p-4 shadow-sm shadow-gray-300/20 backdrop-blur-sm">
      <div className="flex flex-col space-y-4">
        <MultipleAuthors authors={sortedAuthors} />

        <button
          onClick={handleCourseAction}
          disabled={isActionLoading || isPending}
          className="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:bg-neutral-700"
        >
          {isActionLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : !currentUser ? (
            <>
              <LogIn className="h-4 w-4" />
              {t('signIn')}
            </>
          ) : isStarted ? (
            <>
              <BookOpen className="h-4 w-4" />
              {t('continueLearning')}
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              {t('startCourse')}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CourseActionsMobile;
