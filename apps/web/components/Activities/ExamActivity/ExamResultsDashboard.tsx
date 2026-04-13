'use client';

import React from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Download, Eye, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const getDurationSeconds = (
  a: { duration_seconds?: number | null; duration_minutes?: number | null } | null | undefined,
): number | null => {
  if (!a) return null;
  if (typeof a.duration_seconds === 'number') return a.duration_seconds;
  if (typeof a.duration_minutes === 'number') return Math.round(a.duration_minutes * 60);
  return null;
};

const escapeCsv = (v: any): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

interface AttemptData {
  attempt_uuid: string;
  user_id: number;
  user_name: string;
  user_email: string;
  started_at: string;
  finished_at: string | null;
  duration_minutes: number | null;
  duration_seconds?: number | null;
  status: string;
  score: number;
  max_score: number;
  percentage: number;
  violations: any[];
  violation_count: number;
}

interface ExamResultsDashboardProps {
  examUuid: string;
  attempts: AttemptData[];
  // optional callback for parent-level navigation; dashboard also provides internal modal,
  onViewAttempt?: (attemptUuid: string) => void;
  onReviewAttempt?: (attempt: any) => void;
}

export default function ExamResultsDashboard({
  examUuid,
  attempts,
  onViewAttempt,
  onReviewAttempt,
}: ExamResultsDashboardProps) {
  const t = useTranslations('Components.ExamResultsDashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('started_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const statusItems = [
    { value: 'all', label: t('allStatuses') },
    { value: 'SUBMITTED', label: t('submitted') },
    { value: 'AUTO_SUBMITTED', label: t('autoSubmitted') },
    { value: 'IN_PROGRESS', label: t('inProgress') },
  ];

  const sortItems = [
    { value: 'started_at', label: t('startedAt') },
    { value: 'user_name', label: t('studentName') },
    { value: 'percentage', label: t('score') },
    { value: 'duration_minutes', label: t('duration') },
  ];

  // Calculate statistics,
  const stats = useMemo(() => {
    const submitted = attempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');
    const scores = submitted.map((a) => a.percentage);

    const totalTime = submitted
      .map((a) => getDurationSeconds(a))
      .filter((s): s is number => s !== null)
      .reduce((acc, s) => acc + s, 0);

    return {
      totalStudents: new Set(attempts.map((a) => a.user_id)).size,
      totalAttempts: attempts.length,
      submitted: submitted.length,
      inProgress: attempts.filter((a) => a.status === 'IN_PROGRESS').length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      highestScore: scores.length > 0 ? Math.max(...scores) : 0,
      lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
      avgTimeSeconds: submitted.length > 0 && totalTime > 0 ? Math.round(totalTime / submitted.length) : 0,
    };
  }, [attempts]);

  // Filter and sort attempts,
  const filteredAttempts = useMemo(() => {
    let filtered = [...attempts];

    // Search filter,
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) => a.user_name.toLowerCase().includes(query) || a.user_email.toLowerCase().includes(query),
      );
    }

    // Status filter,
    if (statusFilter !== 'all') {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }

    // Sort,
    filtered.sort((a, b) => {
      // dynamic key lookups can be undefined; coalesce to null and handle accordingly,
      let aVal: any = a[sortBy as keyof AttemptData] ?? null;
      let bVal: any = b[sortBy as keyof AttemptData] ?? null;

      if (aVal === null) aVal = sortOrder === 'asc' ? Infinity : -Infinity;
      if (bVal === null) bVal = sortOrder === 'asc' ? Infinity : -Infinity;

      if (typeof aVal === 'string') {
        // ensure we have string operands,
        return sortOrder === 'asc' ? aVal.localeCompare(bVal ?? '') : (bVal ?? '').localeCompare(aVal);
      }

      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return filtered;
  }, [attempts, searchQuery, statusFilter, sortBy, sortOrder]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'SUBMITTED': {
        return t('submitted');
      }
      case 'AUTO_SUBMITTED': {
        return t('autoSubmitted');
      }
      case 'IN_PROGRESS': {
        return t('inProgress');
      }
      default: {
        return status;
      }
    }
  };

  const handleExportCSV = () => {
    const headers = [
      t('exportHeaders.studentName'),
      t('exportHeaders.email'),
      t('exportHeaders.startedAt'),
      t('exportHeaders.finishedAt'),
      t('exportHeaders.duration'),
      t('exportHeaders.status'),
      t('exportHeaders.score'),
      t('exportHeaders.percentage'),
      t('exportHeaders.violations'),
    ];

    const rows = filteredAttempts.map((a) => {
      const durationSeconds = getDurationSeconds(a);
      return [
        escapeCsv(a.user_name),
        escapeCsv(a.user_email),
        escapeCsv(a.started_at),
        escapeCsv(a.finished_at || ''),
        escapeCsv(durationSeconds !== null ? formatDuration(durationSeconds) : ''),
        escapeCsv(getStatusLabel(a.status)),
        escapeCsv(`${a.score}/${a.max_score}`),
        escapeCsv(`${a.percentage}%`),
        escapeCsv(a.violation_count.toString()),
      ];
    });

    const csv = [headers.map(escapeCsv).join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exam-results-${examUuid}-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('exportStarted'));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED': {
        return <Badge variant="default">{t('submitted')}</Badge>;
      }
      case 'AUTO_SUBMITTED': {
        return <Badge variant="destructive">{t('autoSubmitted')}</Badge>;
      }
      case 'IN_PROGRESS': {
        return <Badge variant="secondary">{t('inProgress')}</Badge>;
      }
      default: {
        return <Badge variant="outline">{status}</Badge>;
      }
    }
  };

  // Attempt detail modal state,
  const [selectedAttemptUuid, setSelectedAttemptUuid] = useState<string | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [isAttemptLoading, setIsAttemptLoading] = useState(false);
  // Cache questions keyed by examUuid so we only fetch once
  const [questionsMap, setQuestionsMap] = useState<Record<number, any>>({});

  const handleOpenAttempt = async (row: AttemptData) => {
    setSelectedAttemptUuid(row.attempt_uuid);
    setSelectedAttempt(row);
    setIsAttemptLoading(true);

    try {
      const [attemptRes, questionsRes] = await Promise.all([
        apiFetch(`exams/attempts/${row.attempt_uuid}`),
        Object.keys(questionsMap).length === 0 ? apiFetch(`exams/${examUuid}/questions`) : Promise.resolve(null),
      ]);

      if (!attemptRes.ok) throw new Error('Failed to fetch attempt');
      const data = await attemptRes.json();
      setSelectedAttempt({
        ...row,
        ...data,
        user_name: row.user_name,
        percentage: row.percentage,
        violation_count: row.violation_count,
      });

      if (questionsRes && questionsRes.ok) {
        const qs: any[] = await questionsRes.json();
        const map: Record<number, any> = {};
        for (const q of qs) map[q.id] = q;
        setQuestionsMap(map);
      }
    } catch (error) {
      console.error('Failed to load attempt detail', error);
      toast.error(t('errorLoadingAttempt'));
      setSelectedAttempt(row);
    } finally {
      setIsAttemptLoading(false);
    }
  };

  const handleCloseAttempt = () => {
    setSelectedAttemptUuid(null);
    setSelectedAttempt(null);
    setIsAttemptLoading(false);
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} ${t('minutes')} ${secs} ${t('seconds')}`;
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalStudents')}</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <p className="text-muted-foreground text-xs">
              {t('totalAttempts')}: {stats.totalAttempts}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('averageScore')}</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgScore}%</div>
            <p className="text-muted-foreground text-xs">
              {t('range')}: {stats.lowestScore}% - {stats.highestScore}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('averageTime')}</CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(stats.avgTimeSeconds || 0)}</div>
            <p className="text-muted-foreground text-xs">
              {t('submitted')}: {stats.submitted}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('completionRate')}</CardTitle>
            <TrendingDown className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round((stats.submitted / stats.totalAttempts) * 100) || 0}%</div>
            <p className="text-muted-foreground text-xs">
              {t('inProgress')}: {stats.inProgress}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('allAttempts')}</CardTitle>
              <CardDescription>{t('allAttemptsDescription')}</CardDescription>
            </div>
            <Button
              onClick={handleExportCSV}
              variant="outline"
              size="sm"
            >
              <Download className="mr-2 h-4 w-4" />
              {t('exportCSV')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Input
              placeholder={t('searchStudents')}
              aria-label={t('searchStudents')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => value !== null && setStatusFilter(value)}
              items={statusItems}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statusItems.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(value) => value !== null && setSortBy(value)}
              items={sortItems}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('sortBy')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sortItems.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              aria-label={t('toggleSortOrder')}
              title={t('toggleSortOrder')}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
          </div>

          <div>
            {/* Small screen: stacked list */}
            <div className="space-y-3 md:hidden">
              {filteredAttempts.length === 0 ? (
                <div className="text-muted-foreground text-center">{t('noAttempts')}</div>
              ) : (
                filteredAttempts.map((attempt) => (
                  <div
                    key={attempt.attempt_uuid}
                    className="rounded-lg border p-3"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenAttempt(attempt);
                      }
                    }}
                    onClick={() => handleOpenAttempt(attempt)}
                    aria-label={t('openAttemptCard', { name: attempt.user_name })}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{attempt.user_name}</div>
                        <div className="text-sm text-gray-500">{attempt.user_email}</div>
                        <div className="mt-2 text-sm text-gray-600">
                          {t('startedAt')}: {new Date(attempt.started_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{attempt.percentage}%</div>
                        <div className="text-sm text-gray-500">
                          {attempt.score}/{attempt.max_score}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(attempt.status)}
                        {attempt.violation_count > 0 ? (
                          <Badge variant="destructive">{attempt.violation_count}</Badge>
                        ) : (
                          <span className="text-sm text-gray-500">0</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAttempt(attempt);
                          }}
                          aria-label={t('viewAttemptAria', { name: attempt.user_name })}
                        >
                          {t('view')}
                        </Button>
                        {onReviewAttempt && (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onReviewAttempt(attempt);
                            }}
                            aria-label={t('reviewAttemptAria', { name: attempt.user_name })}
                          >
                            {t('review')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Medium+ screens: table */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        role="columnheader"
                        aria-sort={sortBy === 'user_name' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        {t('student')}
                      </TableHead>
                      <TableHead
                        role="columnheader"
                        aria-sort={
                          sortBy === 'started_at' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        {t('startedAt')}
                      </TableHead>
                      <TableHead role="columnheader">{t('duration')}</TableHead>
                      <TableHead role="columnheader">{t('status')}</TableHead>
                      <TableHead
                        role="columnheader"
                        aria-sort={
                          sortBy === 'percentage' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        {t('score')}
                      </TableHead>
                      <TableHead role="columnheader">{t('violations')}</TableHead>
                      <TableHead
                        className="text-right"
                        role="columnheader"
                      >
                        {t('actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttempts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground text-center"
                        >
                          {t('noAttempts')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAttempts.map((attempt) => (
                        <TableRow key={attempt.attempt_uuid}>
                          <TableCell>
                            <div className="font-medium">{attempt.user_name}</div>
                            <div className="text-muted-foreground text-sm">{attempt.user_email}</div>
                          </TableCell>
                          <TableCell>{new Date(attempt.started_at).toLocaleString()}</TableCell>
                          <TableCell>
                            {(() => {
                              const durationSeconds = getDurationSeconds(attempt);
                              return durationSeconds !== null ? formatDuration(durationSeconds) : '-';
                            })()}
                          </TableCell>
                          <TableCell>{getStatusBadge(attempt.status)}</TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {attempt.score}/{attempt.max_score}
                            </div>
                            <div className="text-muted-foreground text-sm">{attempt.percentage}%</div>
                          </TableCell>
                          <TableCell>
                            {attempt.violation_count > 0 ? (
                              <Badge variant="destructive">{attempt.violation_count}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenAttempt(attempt)}
                                aria-label={t('viewAttemptAria', { name: attempt.user_name })}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {t('view')}
                              </Button>
                              {onReviewAttempt &&
                                (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onReviewAttempt(attempt)}
                                    aria-label={t('reviewAttemptAria', { name: attempt.user_name })}
                                  >
                                    {t('review')}
                                  </Button>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Attempt Detail Modal */}
      <AlertDialog
        open={Boolean(selectedAttemptUuid)}
        onOpenChange={(open) => !open && handleCloseAttempt()}
      >
        <AlertDialogContent className="max-w-3xl min-w-fit">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedAttempt ? `${selectedAttempt.user_name} - ${selectedAttempt.percentage}%` : t('loadingAttempt')}
            </AlertDialogTitle>
            {/* Keep the dialog description minimal to avoid block-level children inside the rendered <p> */}
            <AlertDialogDescription>{selectedAttempt ? '' : t('loading')}</AlertDialogDescription>
          </AlertDialogHeader>

          {/* Moved detailed content outside of AlertDialogDescription to avoid <div> inside <p> */}
          {selectedAttempt ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">{t('startedAt')}</div>
                <div className="font-semibold">{new Date(selectedAttempt.started_at).toLocaleString()}</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">{t('finishedAt')}</div>
                <div className="font-semibold">
                  {selectedAttempt.finished_at ? new Date(selectedAttempt.finished_at).toLocaleString() : '-'}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">{t('duration')}</div>
                <div className="font-semibold">
                  {(() => {
                    const durationSeconds = getDurationSeconds(selectedAttempt);
                    return durationSeconds !== null ? formatDuration(durationSeconds) : '-';
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">{t('status')}</div>
                <div>{getStatusBadge(selectedAttempt.status)}</div>
              </div>

              {selectedAttempt.violation_count > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <div className="text-sm font-semibold text-amber-900">
                    {t('violationsRecorded', { count: selectedAttempt.violation_count })}
                  </div>
                  <ul className="mt-2 list-disc pl-4 text-sm text-gray-700">
                    {selectedAttempt.violations?.map((v: any, idx: number) => (
                      <li key={idx}>
                        {v.type} - {new Date(v.timestamp).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedAttempt.answers && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-600">{t('answersPreview')}</div>
                  {isAttemptLoading || Object.keys(questionsMap).length === 0 ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs">
                      {JSON.stringify(selectedAttempt.answers, null, 2)}
                    </pre>
                  ) : (
                    <div className="mt-2 max-h-64 space-y-2 overflow-auto">
                      {Object.entries(selectedAttempt.answers as Record<string, any>).map(([qid, userAnswer]) => {
                        const question = questionsMap[Number(qid)];
                        if (!question) return null;
                        const opts: any[] = question.answer_options || [];

                        let answerDisplay: React.ReactNode;
                        switch (question.question_type) {
                          case 'SINGLE_CHOICE':
                          case 'TRUE_FALSE':
                            answerDisplay = <span>{opts[userAnswer as number]?.text ?? String(userAnswer)}</span>;
                            break;
                          case 'MULTIPLE_CHOICE':
                            answerDisplay = (
                              <span>
                                {(Array.isArray(userAnswer) ? userAnswer : [])
                                  .map((idx: number) => opts[idx]?.text ?? String(idx))
                                  .join(', ')}
                              </span>
                            );
                            break;
                          case 'MATCHING':
                            answerDisplay = (
                              <div className="space-y-0.5">
                                {Object.entries(userAnswer as Record<string, string>).map(([left, right]) => (
                                  <div
                                    key={left}
                                    className="text-xs"
                                  >
                                    {left} → {right}
                                  </div>
                                ))}
                              </div>
                            );
                            break;
                          default:
                            answerDisplay = <span>{String(userAnswer)}</span>;
                        }

                        return (
                          <div
                            key={qid}
                            className="rounded border bg-gray-50 px-3 py-2 text-sm"
                          >
                            <div className="mb-1 font-medium text-gray-700">{question.question_text}</div>
                            <div className="text-gray-600">{answerDisplay}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>{t('loading')}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleCloseAttempt()}>{t('close')}</AlertDialogCancel>
            {selectedAttempt && (
              <>
                {onReviewAttempt &&
                  (selectedAttempt.status === 'SUBMITTED' || selectedAttempt.status === 'AUTO_SUBMITTED') && (
                    <AlertDialogAction
                      onClick={() => {
                        onReviewAttempt(selectedAttempt);
                        handleCloseAttempt();
                      }}
                    >
                      {t('reviewAnswers')}
                    </AlertDialogAction>
                  )}
                <AlertDialogAction
                  onClick={() => {
                    const payload = JSON.stringify(selectedAttempt, null, 2);
                    const blob = new Blob([payload], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `attempt-${selectedAttempt.attempt_uuid}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(t('downloadStarted'));
                  }}
                >
                  {t('downloadJson')}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
