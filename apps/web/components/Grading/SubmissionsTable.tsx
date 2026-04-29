'use client';

import { BookOpenCheck, Check, ChevronLeft, ChevronRight, Clock4, Download, LoaderCircle, Search } from 'lucide-react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { canSelectForBatchGrading, canTeacherEditGrade, needsTeacherAction } from '@/features/grading/domain';
import type { Submission, SubmissionStatus, TeacherGradeInput } from '@/types/grading';
import { exportGradesCSV, saveGrade } from '@services/grading/grading';
import { useSubmissionStats } from '@/hooks/useSubmissionStats';
import SubmissionStatusBadge from './SubmissionStatusBadge';
import { useSubmissions } from '@/hooks/useSubmissions';
import BatchGradingPanel from './BatchGradingPanel';
import { parseDraftScore } from './GradingPanel';
import GradingStats from './GradingStats';
import GradingPanel from './GradingPanel';

interface SubmissionsTableProps {
  activityId: number;
  title?: string;
}

type StatusFilter = SubmissionStatus | 'ALL' | 'NEEDS_GRADING';

export default function SubmissionsTable({ activityId, title }: SubmissionsTableProps) {
  const t = useTranslations('Grading.Table');

  const [activeFilter, setActiveFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('submitted_at');
  const [openSubmissionUuid, setOpenSubmissionUuid] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedSubmissionUuids, setSelectedSubmissionUuids] = useState<Set<string>>(new Set());
  const [batchPanelOpen, setBatchPanelOpen] = useState(false);

  const filterOptions: { labelKey: string; value: StatusFilter }[] = [
    { labelKey: 'filterAll', value: 'ALL' },
    { labelKey: 'filterNeedsGrading', value: 'NEEDS_GRADING' },
    { labelKey: 'filterPending', value: 'PENDING' },
    { labelKey: 'filterGraded', value: 'GRADED' },
    { labelKey: 'filterPublished', value: 'PUBLISHED' },
    { labelKey: 'filterReturned', value: 'RETURNED' },
  ];

  const statusParam: string | undefined = activeFilter === 'ALL' ? undefined : activeFilter;

  const { submissions, total, pages, page, setPage, isLoading, mutate } = useSubmissions({
    activityId,
    status: statusParam as SubmissionStatus | undefined,
    search: search || undefined,
    sortBy,
  });

  const { stats, mutate: mutateStats } = useSubmissionStats(activityId);
  const needsGradingCount = activeFilter === 'NEEDS_GRADING' ? total : (stats?.needs_grading_count ?? 0);
  const allUuids = submissions.map((submission) => submission.submission_uuid);

  useEffect(() => {
    const selectableOnPage = new Set(
      submissions
        .filter((submission) => canSelectForBatchGrading(submission.status))
        .map((submission) => submission.submission_uuid),
    );
    setSelectedSubmissionUuids((current) => {
      const next = new Set([...current].filter((uuid) => selectableOnPage.has(uuid)));
      return next.size === current.size ? current : next;
    });
  }, [submissions]);

  const selectedSubmissions = useMemo(
    () => submissions.filter((submission) => selectedSubmissionUuids.has(submission.submission_uuid)),
    [selectedSubmissionUuids, submissions],
  );
  const selectableSubmissions = useMemo(
    () => submissions.filter((submission) => canSelectForBatchGrading(submission.status)),
    [submissions],
  );
  const selectedCount = selectedSubmissions.length;
  const allSelectableSelected =
    selectableSubmissions.length > 0 &&
    selectableSubmissions.every((submission) => selectedSubmissionUuids.has(submission.submission_uuid));
  const someSelectableSelected = selectableSubmissions.some((submission) =>
    selectedSubmissionUuids.has(submission.submission_uuid),
  );
  const headerCheckboxState = allSelectableSelected
    ? true
    : someSelectableSelected
      ? ('indeterminate' as const)
      : false;

  const handleGradeSaved = useCallback(
    async (updated: Submission) => {
      const refreshedPage = await mutate();
      await mutateStats();

      const refreshedSubmissions = refreshedPage?.items ?? [];
      const refreshedUuids = refreshedSubmissions.map((submission) => submission.submission_uuid);
      const currentIndex = refreshedUuids.indexOf(updated.submission_uuid);
      const nextUuid =
        refreshedUuids
          .slice(currentIndex + 1)
          .find((uuid) =>
            needsTeacherAction(
              refreshedSubmissions.find((submission) => submission.submission_uuid === uuid)?.status ?? 'GRADED',
            ),
          ) ?? null;

      setOpenSubmissionUuid(nextUuid);
    },
    [mutate, mutateStats],
  );

  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      const csv = await exportGradesCSV(activityId);
      if (!csv) return;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `grades-activity-${activityId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [activityId]);

  const toggleSubmissionSelection = useCallback((submissionUuid: string, checked: boolean | 'indeterminate') => {
    setSelectedSubmissionUuids((current) => {
      const next = new Set(current);
      if (checked === true) {
        next.add(submissionUuid);
      } else {
        next.delete(submissionUuid);
      }
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(
    (checked: boolean | 'indeterminate') => {
      setSelectedSubmissionUuids((current) => {
        const next = new Set(current);
        if (checked === true) {
          for (const submission of selectableSubmissions) {
            next.add(submission.submission_uuid);
          }
        } else {
          for (const submission of selectableSubmissions) {
            next.delete(submission.submission_uuid);
          }
        }
        return next;
      });
    },
    [selectableSubmissions],
  );

  const clearSelection = useCallback(() => {
    setSelectedSubmissionUuids(new Set());
  }, []);

  const refreshTableData = useCallback(async () => {
    await Promise.all([mutate(), mutateStats()]);
  }, [mutate, mutateStats]);

  return (
    <div className="space-y-4">
      <GradingStats activityId={activityId} />

      <div className="flex items-center justify-between">
        <div>
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
          {needsGradingCount > 0 ? (
            <div className="mt-1 flex items-center gap-1.5 text-amber-700">
              <Clock4 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {needsGradingCount} {t('needGrading')}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs"
          >
            {t('total', { count: total })}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={isExporting || total === 0}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t('exportCSV')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <NativeSelect
          value={sortBy}
          onChange={(event) => {
            setSortBy(event.target.value);
            setPage(1);
          }}
          className="w-44"
          aria-label={t('sortBy')}
        >
          <NativeSelectOption value="submitted_at">{t('sortByDate')}</NativeSelectOption>
          <NativeSelectOption value="final_score">{t('sortByScore')}</NativeSelectOption>
          <NativeSelectOption value="attempt_number">{t('sortByAttempt')}</NativeSelectOption>
        </NativeSelect>
      </div>

      <Tabs
        value={activeFilter}
        onValueChange={(value) => {
          setActiveFilter(value as StatusFilter);
          setPage(1);
        }}
      >
        <TabsList className="h-auto flex-wrap gap-1">
          {filterOptions.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
            >
              {t(option.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {selectedCount > 0 ? (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t('selectedCount', { count: selectedCount })}</span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={clearSelection}
            >
              {t('clearSelection')}
            </Button>
          </div>

          <Button
            type="button"
            onClick={() => setBatchPanelOpen(true)}
            disabled={selectedCount === 0}
            className="gap-1.5"
          >
            <BookOpenCheck className="h-4 w-4" />
            {t('batchGrade')}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <PageLoading />
      ) : submissions.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-slate-500">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={headerCheckboxState === true}
                    indeterminate={headerCheckboxState === 'indeterminate'}
                    onCheckedChange={toggleAllVisible}
                    aria-label={t('selectAll')}
                    disabled={selectableSubmissions.length === 0}
                  />
                </TableHead>
                <TableHead>{t('student')}</TableHead>
                <TableHead>{t('attempt')}</TableHead>
                <TableHead>{t('submitted')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead className="text-right">{t('score')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <SubmissionRow
                  key={submission.submission_uuid}
                  submission={submission}
                  isSelected={selectedSubmissionUuids.has(submission.submission_uuid)}
                  onSelectedChange={(checked) => toggleSubmissionSelection(submission.submission_uuid, checked)}
                  onInlineGradeSaved={refreshTableData}
                  onGrade={() => setOpenSubmissionUuid(submission.submission_uuid)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('prev')}
          </Button>
          <span className="text-sm text-slate-600">{t('pageOf', { page, pages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <GradingPanel
        submissionUuid={openSubmissionUuid}
        allSubmissionUuids={allUuids}
        onClose={() => setOpenSubmissionUuid(null)}
        onGradeSaved={handleGradeSaved}
        onNavigate={(uuid) => setOpenSubmissionUuid(uuid)}
      />

      <BatchGradingPanel
        open={batchPanelOpen}
        submissions={selectedSubmissions}
        onClose={() => setBatchPanelOpen(false)}
        onSubmitted={async () => {
          clearSelection();
          await Promise.all([mutate(), mutateStats()]);
          setBatchPanelOpen(false);
        }}
      />
    </div>
  );
}

function SubmissionRow({
  submission,
  isSelected,
  onSelectedChange,
  onInlineGradeSaved,
  onGrade,
}: {
  submission: Submission;
  isSelected: boolean;
  onSelectedChange: (checked: boolean | 'indeterminate') => void;
  onInlineGradeSaved: () => Promise<void>;
  onGrade: () => void;
}) {
  const t = useTranslations('Grading.Table');
  const panelT = useTranslations('Grading.Panel');
  const displayName = submission.user
    ? [submission.user.first_name, submission.user.middle_name, submission.user.last_name].filter(Boolean).join(' ') ||
      `@${submission.user.username}`
    : `User #${submission.user_id}`;

  const actionNeeded = needsTeacherAction(submission.status);
  const selectable = canSelectForBatchGrading(submission.status);
  const canInlineEdit = canTeacherEditGrade(submission.status);
  const [scoreValue, setScoreValue] = useState(submission.final_score !== null ? String(submission.final_score) : '');
  const [isSavingScore, setIsSavingScore] = useState(false);

  useEffect(() => {
    setScoreValue(submission.final_score !== null ? String(submission.final_score) : '');
  }, [submission.final_score, submission.submission_uuid]);

  const parsedScore = parseDraftScore(scoreValue);
  const scoreInvalid = scoreValue !== '' && parsedScore === null;
  const scoreDirty = scoreValue !== (submission.final_score !== null ? String(submission.final_score) : '');

  const getInlineSaveStatus = useCallback((status: SubmissionStatus): TeacherGradeInput['status'] => {
    if (status === 'GRADED') return 'GRADED';
    return 'GRADED';
  }, []);

  const handleInlineSave = useCallback(async () => {
    if (!canInlineEdit || !scoreDirty || scoreInvalid || parsedScore === null) {
      return;
    }

    setIsSavingScore(true);
    try {
      await saveGrade(submission.submission_uuid, {
        final_score: parsedScore,
        status: getInlineSaveStatus(submission.status),
        feedback: submission.grading_json?.feedback ?? '',
        item_feedback: [],
      });
      toast.success(panelT('gradeSaved'));
      await onInlineGradeSaved();
    } catch {
      toast.error(panelT('saveFailed'));
      setScoreValue(submission.final_score !== null ? String(submission.final_score) : '');
    } finally {
      setIsSavingScore(false);
    }
  }, [
    canInlineEdit,
    getInlineSaveStatus,
    onInlineGradeSaved,
    panelT,
    parsedScore,
    scoreDirty,
    scoreInvalid,
    submission.final_score,
    submission.grading_json,
    submission.status,
    submission.submission_uuid,
  ]);

  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={isSelected}
          disabled={!selectable}
          onCheckedChange={onSelectedChange}
          aria-label={t('selectSubmission', { student: displayName })}
        />
      </TableCell>
      <TableCell>
        <div className={cn(!selectable && 'opacity-60')}>
          <p className="text-sm font-medium">{displayName}</p>
          {submission.user?.email ? <p className="text-xs text-slate-400">{submission.user.email}</p> : null}
        </div>
      </TableCell>
      <TableCell className="text-center text-sm text-slate-600">#{submission.attempt_number}</TableCell>
      <TableCell className="text-sm text-slate-600">
        {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '—'}
      </TableCell>
      <TableCell>
        <SubmissionStatusBadge status={submission.status} />
      </TableCell>
      <TableCell className="text-right font-semibold">
        {canInlineEdit ? (
          <div className="ml-auto flex max-w-[8.5rem] items-center justify-end gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={scoreValue}
              placeholder={t('scorePlaceholder')}
              aria-label={t('scoreInputAria', { student: displayName })}
              onChange={(event) => setScoreValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleInlineSave();
                }
                if (event.key === 'Escape') {
                  setScoreValue(submission.final_score !== null ? String(submission.final_score) : '');
                }
              }}
              disabled={isSavingScore}
              className={cn('h-8 w-20 text-right', scoreInvalid && 'border-destructive focus-visible:ring-destructive')}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0"
              disabled={isSavingScore || !scoreDirty || scoreInvalid || parsedScore === null}
              onClick={() => void handleInlineSave()}
              aria-label={t('quickSaveAria', { student: displayName })}
            >
              {isSavingScore ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ) : submission.final_score !== null ? (
          <span>{submission.final_score}/100</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant={actionNeeded ? 'default' : 'outline'}
          onClick={onGrade}
          className="gap-1.5"
        >
          <BookOpenCheck className="h-3.5 w-3.5" />
          {actionNeeded ? t('grade') : t('view')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
