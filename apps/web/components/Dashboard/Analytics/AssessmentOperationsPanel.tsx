'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { TeacherAssessmentDetailResponse } from '@/types/analytics';
import { Download, RotateCcw, Search } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface AssessmentOperationsPanelProps {
  detail: TeacherAssessmentDetailResponse;
}

function escapeCsvValue(value: string | number | null | undefined) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function formatHours(value: number | null | undefined, emptyLabel: string) {
  if (value === null || value === undefined) {
    return emptyLabel;
  }

  return `${value.toFixed(1)}h`;
}

function formatRate(value: number | null | undefined, emptyLabel: string) {
  if (value === null || value === undefined) {
    return emptyLabel;
  }

  return `${value.toFixed(1)}%`;
}

function getSloBadgeVariant(status: TeacherAssessmentDetailResponse['slo']['status']) {
  switch (status) {
    case 'healthy': {
      return 'success';
    }
    case 'warning': {
      return 'warning';
    }
    case 'breached': {
      return 'destructive';
    }
    default: {
      return 'outline';
    }
  }
}

function getMigrationBadgeVariant(
  mode: TeacherAssessmentDetailResponse['migration']['compatibility_mode'],
): 'success' | 'warning' | 'destructive' | 'outline' {
  switch (mode) {
    case 'canonical': {
      return 'success';
    }
    default: {
      return 'success';
    }
  }
}

function getItemSignalBadgeVariant(signal: TeacherAssessmentDetailResponse['item_analytics'][number]['signal']) {
  switch (signal) {
    case 'critical': {
      return 'destructive';
    }
    case 'watch': {
      return 'warning';
    }
    default: {
      return 'success';
    }
  }
}

function getSupportAlertBadgeVariant(
  severity: TeacherAssessmentDetailResponse['support']['alerts'][number]['severity'],
) {
  switch (severity) {
    case 'critical': {
      return 'destructive';
    }
    case 'warning': {
      return 'warning';
    }
    default: {
      return 'success';
    }
  }
}

export default function AssessmentOperationsPanel({ detail }: AssessmentOperationsPanelProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();
  const [auditSearch, setAuditSearch] = useState('');
  const [auditSourceFilter, setAuditSourceFilter] = useState<
    'all' | TeacherAssessmentDetailResponse['audit_history'][number]['source']
  >('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');

  const diagnosticMetrics = [
    { label: t('pages.assessmentOpsAttempts'), value: detail.diagnostics.total_attempt_records },
    { label: t('pages.assessmentOpsDrafts'), value: detail.diagnostics.draft_attempts },
    { label: t('pages.assessmentOpsAwaiting'), value: detail.diagnostics.awaiting_grading },
    { label: t('pages.assessmentOpsHeld'), value: detail.diagnostics.graded_not_released },
    { label: t('pages.assessmentOpsReturned'), value: detail.diagnostics.returned_for_resubmission },
    { label: t('pages.assessmentOpsReleased'), value: detail.diagnostics.released },
    { label: t('pages.assessmentOpsLate'), value: detail.diagnostics.late_submissions },
    { label: t('pages.assessmentOpsBacklog'), value: detail.diagnostics.stale_backlog },
    { label: t('pages.assessmentOpsSuspicious'), value: detail.diagnostics.suspicious_attempts },
    { label: t('pages.assessmentOpsMissingScores'), value: detail.diagnostics.missing_scores },
  ];

  const sloLabels: Record<TeacherAssessmentDetailResponse['slo']['status'], string> = {
    healthy: t('pages.assessmentOpsSloStatusHealthy'),
    warning: t('pages.assessmentOpsSloStatusWarning'),
    breached: t('pages.assessmentOpsSloStatusBreached'),
    not_applicable: t('pages.assessmentOpsSloStatusNotApplicable'),
  };

  const migrationLabels: Record<TeacherAssessmentDetailResponse['migration']['compatibility_mode'], string> = {
    canonical: t('pages.assessmentOpsMigrationModeCanonical'),
  };

  const signalLabels: Record<TeacherAssessmentDetailResponse['item_analytics'][number]['signal'], string> = {
    healthy: t('pages.assessmentSignalHealthy'),
    watch: t('pages.assessmentSignalWatch'),
    critical: t('pages.assessmentSignalCritical'),
  };

  const itemTypeLabels: Record<TeacherAssessmentDetailResponse['item_analytics'][number]['item_type'], string> = {
    workflow: t('pages.assessmentItemTypeWorkflow'),
    question: t('pages.assessmentItemTypeQuestion'),
    test: t('pages.assessmentItemTypeTest'),
  };

  const auditStatuses = [
    ...new Set(detail.audit_history.map((event) => event.status).filter((status): status is string => Boolean(status))),
  ].toSorted();
  const normalizedAuditSearch = auditSearch.trim().toLowerCase();
  const filteredAuditHistory = detail.audit_history.filter((event) => {
    if (auditSourceFilter !== 'all' && event.source !== auditSourceFilter) {
      return false;
    }
    if (auditStatusFilter !== 'all' && event.status !== auditStatusFilter) {
      return false;
    }
    if (!normalizedAuditSearch) {
      return true;
    }

    return [event.action, event.source, event.status, event.summary, event.actor_display_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedAuditSearch));
  });

  const exportAuditHistory = () => {
    const headers = [
      t('pages.assessmentOpsAuditColumnOccurredAt'),
      t('pages.assessmentOpsAuditColumnSource'),
      t('pages.assessmentOpsAuditColumnStatus'),
      t('pages.assessmentOpsAuditColumnAction'),
      t('pages.assessmentOpsAuditColumnActor'),
      t('pages.assessmentOpsAuditColumnAffected'),
      t('pages.assessmentOpsAuditColumnSummary'),
    ];
    const rows = filteredAuditHistory.map((event) => [
      new Date(event.occurred_at).toLocaleString(locale),
      event.source,
      event.status ?? '',
      event.action,
      event.actor_display_name ?? t('pages.assessmentOpsAuditSystem'),
      event.affected_count ?? '',
      event.summary,
    ]);
    const csv = [headers.map(escapeCsvValue).join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join(
      '\n',
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = `${detail.assessment_type}-${detail.assessment_id}-audit`;
    link.href = url;
    link.download = `${slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetAuditFilters = () => {
    setAuditSearch('');
    setAuditSourceFilter('all');
    setAuditStatusFilter('all');
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-slate-200 bg-white/90 shadow-sm xl:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={detail.diagnostics.manual_grading_required ? 'warning' : 'outline'}>
              {detail.diagnostics.manual_grading_required
                ? t('pages.assessmentOpsDiagnosticsManual')
                : t('pages.assessmentOpsDiagnosticsAuto')}
            </Badge>
            <Badge variant={getSloBadgeVariant(detail.slo.status)}>{sloLabels[detail.slo.status]}</Badge>
            <Badge variant={getMigrationBadgeVariant(detail.migration.compatibility_mode)}>
              {migrationLabels[detail.migration.compatibility_mode]}
            </Badge>
          </div>
          <CardTitle>{t('pages.assessmentOpsTitle')}</CardTitle>
          <p className="text-sm text-slate-500">{t('pages.assessmentOpsDescription')}</p>
        </CardHeader>
      </Card>

      <Card className="border-slate-200 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>{t('pages.assessmentOpsDiagnosticsTitle')}</CardTitle>
          {detail.diagnostics.note ? <p className="text-sm text-slate-500">{detail.diagnostics.note}</p> : null}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {diagnosticMetrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
            >
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{metric.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>{t('pages.assessmentSupportTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{detail.support.note}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentSupportEligible')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.support.scoped_eligible_learners}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentSupportVisible')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.support.scoped_visible_learners}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentSupportCohorts')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.support.scoped_cohort_count}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentSupportAuditEvents')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.support.audit_event_count}</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {t('pages.assessmentSupportAlerts')}
              </div>
              {detail.support.alerts.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.support.alerts.map((alert) => (
                    <Badge
                      key={alert.code}
                      variant={getSupportAlertBadgeVariant(alert.severity)}
                    >
                      {alert.summary}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500">{t('pages.assessmentSupportAlertsEmpty')}</div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {t('pages.assessmentSupportBlockers')}
              </div>
              {detail.support.cutover_blockers.length ? (
                <div className="mt-2 space-y-2">
                  {detail.support.cutover_blockers.map((blocker) => (
                    <div
                      key={blocker}
                      className="rounded-2xl border border-slate-200 p-3 text-sm text-slate-700"
                    >
                      {blocker}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500">{t('pages.assessmentSupportBlockersEmpty')}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getSloBadgeVariant(detail.slo.status)}>{sloLabels[detail.slo.status]}</Badge>
            </div>
            <CardTitle>{t('pages.assessmentOpsSloTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{detail.slo.note}</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloTarget')}</div>
              <div className="mt-2 text-2xl font-semibold">{formatHours(detail.slo.target_hours, t('atRisk.na'))}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloP50')}</div>
              <div className="mt-2 text-2xl font-semibold">
                {formatHours(detail.slo.observed_p50_hours, t('atRisk.na'))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloP90')}</div>
              <div className="mt-2 text-2xl font-semibold">
                {formatHours(detail.slo.observed_p90_hours, t('atRisk.na'))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloBacklog')}</div>
              <div className="mt-2 text-2xl font-semibold">{detail.slo.backlog_count}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t('pages.assessmentOpsSloOverdue')}: {detail.slo.overdue_backlog_count}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getMigrationBadgeVariant(detail.migration.compatibility_mode)}>
                {migrationLabels[detail.migration.compatibility_mode]}
              </Badge>
              <Badge variant={detail.migration.cutover_ready ? 'success' : 'warning'}>
                {detail.migration.cutover_ready
                  ? t('pages.assessmentOpsMigrationCutoverReady')
                  : t('pages.assessmentOpsMigrationCutoverBlocked')}
              </Badge>
            </div>
            <CardTitle>{t('pages.assessmentOpsMigrationTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{detail.migration.note}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentOpsMigrationCanonicalRows')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.migration.canonical_row_count}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>{t('pages.assessmentItemTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.item_analytics.length ? (
            <div className="space-y-3">
              {detail.item_analytics.map((item) => (
                <div
                  key={`${item.item_type}-${item.item_key}`}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{itemTypeLabels[item.item_type]}</Badge>
                    <Badge variant={getItemSignalBadgeVariant(item.signal)}>{signalLabels[item.signal]}</Badge>
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-900">{item.item_label}</div>
                  <div className="mt-2 grid gap-3 text-sm text-slate-500 sm:grid-cols-3">
                    <span>
                      {t('pages.assessmentItemPopulation')}: {item.population_count}
                    </span>
                    <span>
                      {t('pages.assessmentItemImpacted')}: {item.impacted_count}
                    </span>
                    <span>
                      {t('pages.assessmentItemRate')}: {formatRate(item.impact_rate, t('atRisk.na'))}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{item.note}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">{t('pages.assessmentItemEmpty')}</div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>{t('pages.assessmentCohortTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.cohort_analytics.length ? (
            <div className="space-y-3">
              {detail.cohort_analytics.map((cohort) => (
                <div
                  key={cohort.cohort_id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="text-sm font-medium text-slate-900">{cohort.cohort_name}</div>
                  <div className="mt-3 grid gap-3 text-sm text-slate-500 sm:grid-cols-3">
                    <span>
                      {t('pages.assessmentCohortEligible')}: {cohort.eligible_learners}
                    </span>
                    <span>
                      {t('pages.assessmentCohortSubmitted')}: {cohort.submitted_learners}
                    </span>
                    <span>
                      {t('pages.assessmentCohortPassRate')}: {formatRate(cohort.pass_rate, t('atRisk.na'))}
                    </span>
                    <span>
                      {t('pages.assessmentCohortAwaiting')}: {cohort.awaiting_grading}
                    </span>
                    <span>
                      {t('pages.assessmentCohortReturned')}: {cohort.returned_for_resubmission}
                    </span>
                    <span>
                      {t('pages.assessmentCohortReleased')}: {cohort.released_learners}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">{t('pages.assessmentCohortEmpty')}</div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white/90 shadow-sm xl:col-span-2">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>{t('pages.assessmentOpsAuditTitle')}</CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                {t('pages.assessmentOpsAuditRowCount', {
                  shown: filteredAuditHistory.length,
                  total: detail.audit_history.length,
                })}
              </p>
            </div>
            {detail.audit_history.length ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetAuditFilters}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('pages.assessmentOpsAuditReset')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={exportAuditHistory}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('pages.assessmentOpsAuditExport')}
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.audit_history.length ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={auditSearch}
                    onChange={(event) => setAuditSearch(event.target.value)}
                    placeholder={t('pages.assessmentOpsAuditSearchPlaceholder')}
                    className="h-10 pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'bulk_action', 'grading_entry'] as const).map((source) => (
                    <Button
                      key={source}
                      type="button"
                      variant={auditSourceFilter === source ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAuditSourceFilter(source)}
                    >
                      {source === 'all' ? t('pages.assessmentOpsAuditFilterAllSources') : source}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={auditStatusFilter === 'all' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setAuditStatusFilter('all')}
                  >
                    {t('pages.assessmentOpsAuditFilterAllStatuses')}
                  </Button>
                  {auditStatuses.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={auditStatusFilter === status ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setAuditStatusFilter(status)}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>

              {filteredAuditHistory.length ? (
                <div className="space-y-3">
                  {filteredAuditHistory.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{event.source}</Badge>
                        {event.status ? <Badge variant="secondary">{event.status}</Badge> : null}
                      </div>
                      <div className="mt-3 text-sm font-medium text-slate-900">{event.summary}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span>{event.actor_display_name || t('pages.assessmentOpsAuditSystem')}</span>
                        <span>{new Date(event.occurred_at).toLocaleString(locale)}</span>
                        {event.affected_count !== null && event.affected_count !== undefined ? (
                          <span>
                            {t('pages.assessmentOpsAuditAffected')}: {event.affected_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  {t('pages.assessmentOpsAuditFilteredEmpty')}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-500">{t('pages.assessmentOpsAuditEmpty')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
