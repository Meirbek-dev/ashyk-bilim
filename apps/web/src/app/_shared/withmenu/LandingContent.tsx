import { getServerGamificationDashboard } from '@/services/gamification/server';
import { getSession } from '@/lib/auth/session';
import LandingClassic from '@components/Landings/LandingClassic';
import LandingCustom from '@components/Landings/LandingCustom';
import { getCollections } from '@services/courses/collections';
import { getPlatform } from '@/services/platform/platform';
import { getCourses } from '@services/courses/courses';
import { getCurrentTrail } from '@services/courses/activity';

function isExpectedPrerenderCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const isNextError =
    message.includes('prerender') ||
    message.includes('cookies()') ||
    message.includes('dynamic server usage') ||
    (error as any).digest?.startsWith('NEXT_');

  return (
    error.name === 'AbortError' ||
    message.includes('connection closed') ||
    message.includes('aborted') ||
    message.includes('cancelled') ||
    message.includes('canceled') ||
    isNextError
  );
}

function logLandingFetchError(scope: string, error: unknown) {
  if (isExpectedPrerenderCancellation(error)) {
    return;
  }

  console.error(`[LandingContent] ${scope}:`, {
    message: error instanceof Error ? error.message : 'Unknown error',
    cause: error instanceof Error ? error.cause : undefined,
  });
}

function sortCoursesByProgress(courses: any[], trailData: any) {
  if (!trailData?.runs) return courses;

  return [...courses].sort((a, b) => {
    const aCleanUuid = a.course_uuid?.replace('course_', '');
    const bCleanUuid = b.course_uuid?.replace('course_', '');

    const aRun = trailData.runs.find((r: any) => r.course?.course_uuid?.replace('course_', '') === aCleanUuid);
    const bRun = trailData.runs.find((r: any) => r.course?.course_uuid?.replace('course_', '') === bCleanUuid);

    const getProgress = (run: any, course: any) => {
      if (!run) return 0;
      const total =
        run.course_total_steps ||
        course.chapters?.reduce((acc: number, chap: any) => acc + (chap.activities?.length || 0), 0) ||
        0;
      const completed = run.steps?.filter((s: any) => s.complete === true)?.length || 0;
      return total > 0 ? Math.round((completed / total) * 100) : 0;
    };

    const aProgress = getProgress(aRun, a);
    const bProgress = getProgress(bRun, b);

    const aInProgress = aProgress > 0 && aProgress < 100;
    const bInProgress = bProgress > 0 && bProgress < 100;

    // 1. In-progress courses first
    if (aInProgress !== bInProgress) return bInProgress ? 1 : -1;

    // 2. Higher progress first
    if (aProgress !== bProgress) return bProgress - aProgress;

    // 3. Fallback to newest
    const aDate = new Date(a.creation_date || a.created_at || a.update_date || 0).getTime();
    const bDate = new Date(b.creation_date || b.created_at || b.update_date || 0).getTime();
    return bDate - aDate;
  });
}

export async function LandingContent() {
  try {
    // Fetch platform info with detailed error handling
    let platform;
    try {
      platform = await getPlatform();
    } catch (error) {
      console.error('[LandingContent] Failed to fetch platform info:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        cause: error instanceof Error ? error.cause : undefined,
      });
      throw new Error('Unable to load the platform. Please check your network connection and try again.', {
        cause: error,
      });
    }

    const hasCustomLanding = platform?.landing?.enabled;

    // Only fetch gamification data if user is authenticated
    const session = await getSession();
    const gamificationPromise = session
      ? getServerGamificationDashboard().catch((error: unknown) => {
          logLandingFetchError('Gamification fetch failed', error);
          return null;
        })
      : Promise.resolve(null);

    if (hasCustomLanding && platform?.landing) {
      const gamificationData = await gamificationPromise;

      return (
        <LandingCustom
          landing={platform.landing as { sections: any[]; enabled: boolean }}
          gamificationData={gamificationData}
        />
      );
    }

    const [coursesData, collections, gamificationData, trailData] = await Promise.all([
      getCourses(undefined, 1, 20).catch((error: unknown) => {
        logLandingFetchError('Courses fetch failed', error);
        return { courses: [], total: 0 };
      }),
      getCollections().catch((error: unknown) => {
        logLandingFetchError('Collections fetch failed', error);
        return [];
      }),
      gamificationPromise,
      session ? getCurrentTrail().catch(() => null) : Promise.resolve(null),
    ]);

    const { courses } = coursesData;
    const totalCourses = coursesData.total;
    const sortedCourses = sortCoursesByProgress(courses, trailData);

    return (
      <LandingClassic
        courses={sortedCourses}
        totalCourses={totalCourses}
        collections={collections}
        gamificationData={gamificationData}
        trailData={trailData}
        isAuthenticated={Boolean(session)}
      />
    );
  } catch (error) {
    if (isExpectedPrerenderCancellation(error)) {
      throw error;
    }

    console.error('[LandingContent] Critical error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    });
    throw error; // Re-throw to be caught by error boundary
  }
}
