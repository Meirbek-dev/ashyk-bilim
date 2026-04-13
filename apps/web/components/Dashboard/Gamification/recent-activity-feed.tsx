'use client';

import { EmptyState, GamificationCard, LoadingState, getXPSourceTheme } from '@/lib/gamification';
import { useDateFnsLocale } from '@/hooks/useDateFnsLocale';
import type { XPTransaction } from '@/types/gamification';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface RecentActivityFeedProps {
  transactions: XPTransaction[];
  isLoading?: boolean;
}

export function RecentActivityFeed({ transactions, isLoading }: RecentActivityFeedProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');
  const locale = useDateFnsLocale();

  if (isLoading) {
    return (
      <LoadingState
        title={t('dashboard.recentActivity')}
        variant="feed"
        itemCount={5}
      />
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <EmptyState
        title={t('dashboard.recentActivity')}
        message={t('dashboard.noActivityDescription')}
        variant="info"
      />
    );
  }

  return (
    <GamificationCard title={t('dashboard.recentActivity')}>
      <ScrollArea className="max-h-[500] pr-4">
        <div className="space-y-3">
          {transactions.map((transaction) => {
            const theme = getXPSourceTheme(transaction.source);
            const timeAgo = transaction.created_at
              ? formatDistanceToNow(new Date(transaction.created_at), {
                  addSuffix: true,
                  locale,
                })
              : '';

            return (
              <div
                key={transaction.id}
                className="hover:bg-muted/50 flex items-center gap-3 rounded-md p-2 transition-colors"
              >
                <div className={cn('rounded-md p-2 shrink-0', theme.bgColor)}>
                  <theme.icon className={cn('h-3.5 w-3.5', theme.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t(`xpSources.${transaction.source}`)}</p>
                  <p className="text-muted-foreground text-xs">{timeAgo}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums">+{transaction.amount}</span>
                  <p className="text-muted-foreground text-xs">XP</p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </GamificationCard>
  );
}
