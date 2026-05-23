'use client';

import { BarChart3, BookOpenCheck, Clock4, ExternalLink, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { apiFetcher } from '@/lib/api-client';
import Link from '@components/ui/AppLink';
import { Button } from '@/components/ui/button';

interface ScoreDistributionBucket {
  range: string;
  count: number;
}

interface SubmissionStats {
  total: number;
  needs_grading_count: number;
  avg_score: number | null;
  pass_rate: number | null;
  score_distribution: ScoreDistributionBucket[];
}

interface ResultsReviewTabProps {
  assessmentUuid: string;
  courseUuid?: string | null;
  activityUuid: string;
}

export default function ResultsReviewTab({ assessmentUuid, courseUuid, activityUuid }: ResultsReviewTabProps) {
  const t = useTranslations('Features.Assessments.Studio.ResultsReview');
  const [stats, setStats] = useState<SubmissionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetcher<SubmissionStats>(`assessments/${assessmentUuid}/submissions/stats`)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentUuid]);

  const cleanCourseUuid = courseUuid?.replace(/^course_/, '') ?? '';
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '');
  const reviewHref = cleanCourseUuid
    ? `/dash/courses/${cleanCourseUuid}/activity/${cleanActivityUuid}/review`
    : `/dash/courses/activity/${cleanActivityUuid}/review`;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-muted rounded-md border p-2">
            <BarChart3 className="text-muted-foreground size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={reviewHref} />}
        >
          <ExternalLink className="size-4" />
          {t('openReview')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <ResultMetric
          icon={Users}
          label={t('submissions')}
          value={stats?.total ?? 0}
        />
        <ResultMetric
          icon={Clock4}
          label={t('needsReview')}
          value={stats?.needs_grading_count ?? 0}
          accent="amber"
        />
        <ResultMetric
          icon={TrendingUp}
          label={t('averageScore')}
          value={stats?.avg_score !== null && stats?.avg_score !== undefined ? `${stats.avg_score.toFixed(1)}%` : '--'}
          accent="sky"
        />
        <ResultMetric
          icon={BookOpenCheck}
          label={t('passRate')}
          value={stats?.pass_rate !== null && stats?.pass_rate !== undefined ? `${stats.pass_rate.toFixed(0)}%` : '--'}
          accent="emerald"
        />
      </div>

      {stats && stats.score_distribution.some((b) => b.count > 0) && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">{t('scoreDistributionTitle')}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.score_distribution} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(label) => `Score: ${label}`}
                formatter={(value) => [Number(value ?? 0), t('submissions')]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} className="fill-primary" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <InsightPanel
          title={t('queueTitle')}
          body={t('queueBody')}
        />
        <InsightPanel
          title={t('questionQualityTitle')}
          body={t('questionQualityBody')}
        />
        <InsightPanel
          title={t('releaseTitle')}
          body={t('releaseBody')}
        />
      </section>
    </div>
  );
}

function ResultMetric({
  icon: Icon,
  label,
  value,
  accent = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: 'default' | 'amber' | 'sky' | 'emerald';
}) {
  const color = {
    default: 'text-muted-foreground',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
  }[accent];
  return (
    <div className="bg-card rounded-lg border p-4">
      <Icon className={`${color} size-5`} />
      <p className="text-muted-foreground mt-3 text-xs">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function InsightPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm">{body}</p>
    </div>
  );
}
