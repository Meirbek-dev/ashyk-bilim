'use client';
import { RecentActivityFeed } from '@/components/Dashboard/Gamification/recent-activity-feed';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { Leaderboard } from '@/components/Dashboard/Gamification/leaderboard';
import TrailCourseElement from '@components/Pages/Trail/TrailCourseElement';
import { useSession } from '@/hooks/useSession';
import UserCertificates from '@components/Pages/Trail/UserCertificates';
import { Skeleton } from '@/components/ui/skeleton';
import { useGamificationStore } from '@/stores/gamification';
import { useTrailCurrent, useTrailLeaderboard } from '@/features/trail/hooks/useTrail';
import { useTranslations } from 'next-intl';
import { BookOpen } from 'lucide-react';

const EMPTY_RECENT_TRANSACTIONS: any[] = [];

function TrailCourseSkeletons() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border-border bg-card flex gap-4 rounded-xl border p-4"
        >
          <Skeleton className="h-[76px] w-[108px] shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col justify-between gap-3 py-0.5">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-52" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-9" />
              </div>
              <Skeleton className="h-1.5 w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const Trail = () => {
  const { user: currentUser } = useSession();
  const t = useTranslations('TrailPage');

  const { data: trail, isLoading: isTrailLoading } = useTrailCurrent();

  const gamificationProfile = useGamificationStore((s) => s.profile);
  const recentTransactions = useGamificationStore((s) => s.dashboard?.recent_transactions ?? EMPTY_RECENT_TRANSACTIONS);
  const userRank = useGamificationStore((s) => s.dashboard?.user_rank);
  const isGamificationLoading = useGamificationStore((s) => s.isLoading);
  const gamificationData = {
    profile: gamificationProfile,
    recent_transactions: recentTransactions,
    user_rank: userRank,
  };

  const { data: leaderboardData } = useTrailLeaderboard(10);

  const userRankData = { rank: gamificationData.user_rank };

  return (
    <GeneralWrapper>
      <div className="space-y-6">
        {/* Progress Section */}
        <section>
          <div className="mb-4 flex items-center gap-2.5">
            <BookOpen className="text-primary h-5 w-5 shrink-0" />
            <h2 className="text-foreground text-lg font-semibold">{t('myProgress')}</h2>
            {trail?.runs && trail.runs.length > 0 && (
              <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs font-medium tabular-nums">
                {trail.runs.length}
              </span>
            )}
          </div>

          {isTrailLoading ? (
            <TrailCourseSkeletons />
          ) : !trail || trail.runs.length === 0 ? (
            <div className="border-border bg-card rounded-xl border py-12 text-center">
              <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <BookOpen className="text-muted-foreground h-6 w-6" />
              </div>
              <p className="text-foreground text-sm font-medium">{t('noCoursesInProgress')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t('startACourseToSeeYourProgress')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trail.runs.map((run: any) => (
                <TrailCourseElement
                  key={run.course.course_uuid}
                  run={run}
                  course={run.course}
                />
              ))}
            </div>
          )}
        </section>

        {/* Certificates Section */}
        <UserCertificates />

        {/* Gamification Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Leaderboard
            entries={leaderboardData?.entries || []}
            currentUserId={currentUser?.id || undefined}
            userRank={userRankData?.rank}
          />
          <RecentActivityFeed
            transactions={gamificationData?.recent_transactions || []}
            isLoading={isGamificationLoading}
          />
        </div>
      </div>
    </GeneralWrapper>
  );
};

export default Trail;
