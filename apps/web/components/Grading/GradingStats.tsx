'use client';

import { BookOpenCheck, Clock4, TrendingUp, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useSubmissionStats } from '@/hooks/useSubmissionStats';
import { Card, CardContent } from '@components/ui/card';
import { cn } from '@/lib/utils';

interface GradingStatsProps {
  activityId: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: 'amber' | 'emerald' | 'sky' | 'default';
}

function StatCard({ label, value, icon: Icon, accent = 'default' }: StatCardProps) {
  const colorMap = {
    default: 'text-slate-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-3 p-3">
        <Icon className={cn('h-5 w-5 shrink-0', colorMap[accent])} />
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-lg leading-tight font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GradingStats({ activityId }: GradingStatsProps) {
  const t = useTranslations('Grading.Stats');
  const { stats } = useSubmissionStats(activityId);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label={t('total')}
        value={stats.total}
        icon={Users}
      />
      <StatCard
        label={t('needsGrading')}
        value={stats.needs_grading_count}
        icon={Clock4}
        accent="amber"
      />
      <StatCard
        label={t('avgScore')}
        value={stats.avg_score !== null ? `${stats.avg_score.toFixed(1)}%` : '—'}
        icon={TrendingUp}
        accent="sky"
      />
      <StatCard
        label={t('passRate')}
        value={stats.pass_rate !== null ? `${stats.pass_rate.toFixed(0)}%` : '—'}
        icon={BookOpenCheck}
        accent="emerald"
      />
    </div>
  );
}
