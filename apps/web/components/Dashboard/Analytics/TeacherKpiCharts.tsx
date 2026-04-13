'use client';

import type { MetricCard, TimeSeriesPoint } from '@/types/analytics';
import KpiActiveLearnerLineChart from './KpiActiveLearnerLineChart';
import KpiSubmissionAreaChart from './KpiSubmissionAreaChart';
import KpiPeriodCompBarChart from './KpiPeriodCompBarChart';
import KpiHealthRingsChart from './KpiHealthRingsChart';
import KpiHealthRadarChart from './KpiHealthRadarChart';
import { useLocale, useTranslations } from 'next-intl';
import KpiCompletionGauge from './KpiCompletionGauge';

interface TeacherKpiChartsProps {
  metrics: {
    active_learners: MetricCard;
    returning_learners: MetricCard;
    completion_rate: MetricCard;
    at_risk_learners: MetricCard;
    ungraded_submissions: MetricCard;
    negative_engagement_courses: MetricCard;
  };
  trends: {
    active_learners: TimeSeriesPoint[];
    completions: TimeSeriesPoint[];
    submissions: TimeSeriesPoint[];
    grading_completed: TimeSeriesPoint[];
  };
}

/** Returns the previous-period absolute value for a metric, or null if comparison is unavailable. */
function prevValue(m: MetricCard): number | null {
  return m.delta_value !== null ? m.value - m.delta_value : null;
}

/**
 * Returns a 0–100 "health" score:
 * - Percentage-unit metrics use their raw value directly (completion_rate is already 0–100).
 * - Count metrics start at a neutral 50 and shift by half of delta_pct in the "better" direction.
 */
function getHealthPct(m: MetricCard): number {
  if (m.unit === '%') return Math.min(100, Math.max(0, m.value));
  if (m.delta_pct === null) return 50;
  const trending = m.is_higher_better ? m.delta_pct : -m.delta_pct;
  return Math.min(100, Math.max(0, 50 + trending / 2));
}

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-1)',
];

export default function TeacherKpiCharts({ metrics, trends }: TeacherKpiChartsProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();
  const m = metrics;

  // ── Area chart data ───────────────────────────────────────────────────────
  const gradingMap = new Map(trends.grading_completed.map((p) => [p.bucket_start, p.value]));
  const areaData = trends.submissions.map((p) => ({
    bucket: new Date(p.bucket_start).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    submissions: p.value,
    grading: gradingMap.get(p.bucket_start) ?? 0,
  }));

  // ── Line chart data ───────────────────────────────────────────────────────
  const lineData = trends.active_learners.map((p) => ({
    bucket: new Date(p.bucket_start).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    active: p.value,
  }));

  // ── Bar chart data ────────────────────────────────────────────────────────
  const barData = [
    {
      metric: t('kpiCharts.activeLearners'),
      current: m.active_learners.value,
      previous: prevValue(m.active_learners),
    },
    {
      metric: t('kpiCharts.returningLearners'),
      current: m.returning_learners.value,
      previous: prevValue(m.returning_learners),
    },
    {
      metric: t('kpiCharts.atRiskLearners'),
      current: m.at_risk_learners.value,
      previous: prevValue(m.at_risk_learners),
    },
    {
      metric: t('kpiCharts.ungradedSubs'),
      current: m.ungraded_submissions.value,
      previous: prevValue(m.ungraded_submissions),
    },
    {
      metric: t('kpiCharts.negativeEngagement'),
      current: m.negative_engagement_courses.value,
      previous: prevValue(m.negative_engagement_courses),
    },
  ];

  // ── Radar chart data ──────────────────────────────────────────────────────
  const radarKeys = [
    { subject: t('kpiCharts.activeLearners'), key: 'active_learners' },
    { subject: t('kpiCharts.returningLearners'), key: 'returning_learners' },
    { subject: t('kpiCharts.completionRate'), key: 'completion_rate' },
    { subject: t('kpiCharts.atRiskLearners'), key: 'at_risk_learners' },
    { subject: t('kpiCharts.ungradedSubs'), key: 'ungraded_submissions' },
    { subject: t('kpiCharts.negativeEngagement'), key: 'negative_engagement_courses' },
  ] as const;

  const radarData = radarKeys.map(({ subject, key }) => {
    const metric = m[key];
    const currHealth = getHealthPct(metric);
    let prevHealth: number;
    if (metric.unit === '%') {
      const prev = prevValue(metric);
      prevHealth = prev !== null ? Math.min(100, Math.max(0, prev)) : currHealth;
    } else if (metric.delta_pct === null) {
      prevHealth = 50;
    } else {
      const trending = metric.is_higher_better ? metric.delta_pct : -metric.delta_pct;
      prevHealth = Math.min(100, Math.max(0, currHealth - trending / 2));
    }
    return { subject, current: currHealth, previous: prevHealth };
  });

  // ── Radial chart data ─────────────────────────────────────────────────────
  const radialData = [
    {
      name: 'active_learners',
      label: t('kpiCharts.activeLearners'),
      value: getHealthPct(m.active_learners),
      fill: CHART_COLORS[0] ?? 'var(--chart-1)',
    },
    {
      name: 'returning_learners',
      label: t('kpiCharts.returningLearners'),
      value: getHealthPct(m.returning_learners),
      fill: CHART_COLORS[1] ?? 'var(--chart-2)',
    },
    {
      name: 'completion_rate',
      label: t('kpiCharts.completionRate'),
      value: getHealthPct(m.completion_rate),
      fill: CHART_COLORS[2] ?? 'var(--chart-3)',
    },
    {
      name: 'at_risk_learners',
      label: t('kpiCharts.atRiskLearners'),
      value: getHealthPct(m.at_risk_learners),
      fill: CHART_COLORS[3] ?? 'var(--chart-4)',
    },
    {
      name: 'ungraded_submissions',
      label: t('kpiCharts.ungradedSubs'),
      value: getHealthPct(m.ungraded_submissions),
      fill: CHART_COLORS[4] ?? 'var(--chart-5)',
    },
    {
      name: 'negative_engagement_courses',
      label: t('kpiCharts.negativeEngagement'),
      value: getHealthPct(m.negative_engagement_courses),
      fill: CHART_COLORS[5] ?? 'var(--chart-1)',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <KpiSubmissionAreaChart data={areaData} />
        <KpiActiveLearnerLineChart data={lineData} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <KpiPeriodCompBarChart data={barData} />
        <KpiCompletionGauge
          completionPct={m.completion_rate.value}
          deltaPct={m.completion_rate.delta_pct}
          direction={m.completion_rate.direction}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <KpiHealthRadarChart data={radarData} />
        <KpiHealthRingsChart data={radialData} />
      </div>
    </div>
  );
}
