'use client';

import { BookOpenCheck, Clock4, TrendingUp, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Submission } from '@/features/grading/domain';
import { cn } from '@/lib/utils';
import ReviewBulkActionBar from './ReviewBulkActionBar';

interface SubmissionStats {
  total: number;
  needs_grading_count: number;
  avg_score: number | null;
  pass_rate: number | null;
}

export default function ReviewLayout({
  activityId,
  title,
  total,
  stats,
  selectedSubmissions,
  children,
  onBulkRefresh,
}: {
  activityId: number;
  title?: string;
  total: number;
  stats?: SubmissionStats | null;
  selectedSubmissions: Submission[];
  children: ReactNode;
  onBulkRefresh: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col">
      <div className="border-b px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{title ?? 'Submission Review'}</h1>
              <p className="text-muted-foreground text-sm">
                {stats?.needs_grading_count ?? 0} need grading · {total} in current queue
              </p>
            </div>
            <ReviewBulkActionBar
              activityId={activityId}
              submissions={selectedSubmissions}
              disabled={selectedSubmissions.length === 0}
              onRefresh={onBulkRefresh}
            />
          </div>
          <StatsGrid stats={stats} />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_24rem]">
        {children}
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats?: SubmissionStats | null }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile
        label="Total"
        value={stats.total}
        icon={Users}
      />
      <StatTile
        label="Needs grading"
        value={stats.needs_grading_count}
        icon={Clock4}
        accent="amber"
      />
      <StatTile
        label="Avg score"
        value={stats.avg_score !== null ? `${stats.avg_score.toFixed(1)}%` : '--'}
        icon={TrendingUp}
        accent="sky"
      />
      <StatTile
        label="Pass rate"
        value={stats.pass_rate !== null ? `${stats.pass_rate.toFixed(0)}%` : '--'}
        icon={BookOpenCheck}
        accent="emerald"
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent = 'default',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: 'amber' | 'emerald' | 'sky' | 'default';
}) {
  const colorMap = {
    default: 'text-muted-foreground',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
  };

  return (
    <div className="bg-card flex items-center gap-3 rounded-md border p-3">
      <Icon className={cn('size-5 shrink-0', colorMap[accent])} />
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-lg leading-tight font-semibold">{value}</p>
      </div>
    </div>
  );
}
