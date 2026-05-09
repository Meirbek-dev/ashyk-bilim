import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server';
import { GamificationProvider } from '@/components/Contexts/GamificationContext';
import { RecentActivityFeed } from './Gamification/recent-activity-feed';
import { HeroSection } from './Gamification/hero-section';
import { Leaderboard } from './Gamification/leaderboard';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession } from '@/lib/auth/session';

/**
 * Unified Gamification Dashboard (Server Component)
 *
 * Fetches gamification data and renders dashboard components.
 * Returns null if user is not authenticated to avoid render loops.
 */
export default async function GamificationDashboard() {
  try {
    const session = await getSession();
    const userId = session?.user?.id;

    // Return null early if no session (not authenticated)
    if (!session || !userId) {
      return null;
    }

    // Fetch dashboard data and leaderboard in parallel
    // Caching is handled inside the service functions via `use cache`
    const [dashboardData, leaderboardData] = await Promise.all([
      getServerGamificationDashboard(),
      getServerLeaderboard(10),
    ]);

    // If no dashboard data (error or not available), return null silently
    if (!dashboardData) {
      return null;
    }

    return (
      <GamificationProvider
        initialData={{
          dashboard: dashboardData,
          profile: dashboardData.profile,
          leaderboard: dashboardData.leaderboard ?? null,
        }}
      >
        <div className="space-y-4">
          {/* Hero Section - Main Profile & Stats */}
          <HeroSection
            profile={dashboardData.profile}
            userRank={dashboardData.user_rank}
          />

          {/* Two Column Layout */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RecentActivityFeed transactions={dashboardData.recent_transactions || []} />

            {/* Right Column: Leaderboard */}
            {leaderboardData && (
              <Leaderboard
                entries={leaderboardData.entries}
                currentUserId={userId || undefined}
                userRank={dashboardData.user_rank}
              />
            )}
          </div>
        </div>
      </GamificationProvider>
    );
  } catch (error) {
    // Silently fail - log error but don't crash the app
    console.error('Gamification dashboard error:', error);
    return null;
  }
}

/**
 * Loading Skeleton
 */
export function GamificationDashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[200px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[380px]" />
        <Skeleton className="h-[380px]" />
      </div>
    </div>
  );
}
