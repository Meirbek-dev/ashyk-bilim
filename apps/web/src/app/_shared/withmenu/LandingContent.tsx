import { getServerGamificationDashboard } from '@/services/gamification/server';
import { getSession } from '@/lib/auth/session';
import LandingClassic from '@components/Landings/LandingClassic';
import LandingCustom from '@components/Landings/LandingCustom';
import { getCollections } from '@services/courses/collections';
import { getPlatform } from '@/services/platform/platform';
import { getCourses } from '@services/courses/courses';
import { connection } from 'next/server';

function isExpectedPrerenderCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('connection closed') ||
    message.includes('aborted') ||
    message.includes('cancelled') ||
    message.includes('canceled')
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

export async function LandingContent() {
  // Must be outside any try/catch — this is a Next.js prerender-completion
  // signal that has to propagate unchanged up the component tree.
  await connection();

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

    const [coursesData, collections, gamificationData] = await Promise.all([
      getCourses(undefined, 1, 20).catch((error: unknown) => {
        logLandingFetchError('Courses fetch failed', error);
        return { courses: [], total: 0 };
      }),
      getCollections().catch((error: unknown) => {
        logLandingFetchError('Collections fetch failed', error);
        return [];
      }),
      gamificationPromise,
    ]);

    const { courses } = coursesData;
    const totalCourses = coursesData.total;
    return (
      <LandingClassic
        courses={courses}
        totalCourses={totalCourses}
        collections={collections}
        gamificationData={gamificationData}
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
