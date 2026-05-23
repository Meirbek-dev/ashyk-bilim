'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Eye, FileText, Loader2, RefreshCw, RotateCcw, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  fileSubmissionExportUrl,
  getFileSubmissionByActivity,
  getFileSubmissionFileUrl,
  getFileSubmissionReviewQueue,
  gradeFileSubmissionAttempt,
} from '@/features/file-submissions/services/file-submissions';
import type { FileSubmissionAttempt } from '@/features/file-submissions/services/file-submissions';

// ── Rubric types (convention-based schema stored in rubric_json) ──────────────

interface RubricCriterionLevel {
  label: string;
  score: number;
  description?: string;
}

interface RubricCriterion {
  criterion_id: string;
  label: string;
  max_score: number;
  levels?: RubricCriterionLevel[];
}

function parseRubricCriteria(rubric: Record<string, unknown>): RubricCriterion[] {
  const { criteria } = rubric as { criteria?: unknown };
  if (!Array.isArray(criteria)) return [];
  return criteria.filter(
    (c): c is RubricCriterion =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as RubricCriterion).criterion_id === 'string' &&
      typeof (c as RubricCriterion).label === 'string',
  );
}

interface FileSubmissionReviewWorkspaceProps {
  activityUuid: string;
  initialAttemptUuid?: string | null;
}

const activityQueryKey = (activityUuid: string) => ['file-submission', 'review-activity', activityUuid] as const;
const queueQueryKey = (fileSubmissionUuid: string) => ['file-submission', 'review-queue', fileSubmissionUuid] as const;

export default function FileSubmissionReviewWorkspace({
  activityUuid,
  initialAttemptUuid,
}: FileSubmissionReviewWorkspaceProps) {
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(initialAttemptUuid ?? null);
  const [score, setScore] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState<string | null>(null); // attemptFileUuid

  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: activityQueryKey(cleanActivityUuid),
    queryFn: () => getFileSubmissionByActivity(cleanActivityUuid),
    enabled: Boolean(cleanActivityUuid),
  });

  const { data: queue, isLoading: isQueueLoading } = useQuery({
    queryKey: config ? queueQueryKey(config.file_submission_uuid) : ['file-submission', 'review-queue', 'pending'],
    queryFn: () => getFileSubmissionReviewQueue(config!.file_submission_uuid),
    enabled: Boolean(config?.file_submission_uuid),
  });

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = queue?.items ?? [];
    if (!term) return items;
    return items.filter((attempt) => {
      const { user } = attempt;
      const name = `${user?.first_name ?? ''} ${user?.last_name ?? ''} ${user?.email ?? ''} ${user?.username ?? ''}`;
      return name.toLowerCase().includes(term);
    });
  }, [queue?.items, search]);

  const selected = filteredItems.find((attempt) => attempt.attempt_uuid === selectedUuid) ?? filteredItems[0] ?? null;

  const gradeMutation = useMutation({
    mutationFn: async ({ status }: { status: 'GRADED' | 'PUBLISHED' | 'RETURNED' }) => {
      if (!config || !selected) throw new Error('Submission is unavailable');
      const rubricPayload =
        parsedCriteria.length > 0
          ? {
              criteria: parsedCriteria.map((c) => ({
                criterion_id: c.criterion_id,
                label: c.label,
                score: rubricScores[c.criterion_id] ?? 0,
                max_score: c.max_score,
              })),
            }
          : {};
      return await gradeFileSubmissionAttempt(
        config.file_submission_uuid,
        selected.attempt_uuid,
        {
          final_score: score.trim() === '' ? null : Number(score),
          feedback,
          rubric: rubricPayload,
          status,
        },
        selected.version,
      );
    },
    onSuccess: async () => {
      if (config)
        await queryClient.invalidateQueries({
          queryKey: queueQueryKey(config.file_submission_uuid),
        });
      toast.success('Submission updated');
    },
    onError: (gradeError) => {
      toast.error(gradeError instanceof Error ? gradeError.message : 'Unable to update submission');
    },
  });

  const parsedCriteria = useMemo(() => (config?.rubric ? parseRubricCriteria(config.rubric) : []), [config?.rubric]);

  // Auto-fill score from rubric criterion scores
  const rubricTotalScore = useMemo(() => {
    if (parsedCriteria.length === 0) return null;
    return parsedCriteria.reduce((acc, c) => acc + (rubricScores[c.criterion_id] ?? 0), 0);
  }, [parsedCriteria, rubricScores]);

  function selectAttempt(attempt: FileSubmissionAttempt) {
    setSelectedUuid(attempt.attempt_uuid);
    setScore(attempt.final_score === null ? '' : String(attempt.final_score));
    setFeedback(typeof attempt.feedback?.feedback === 'string' ? attempt.feedback.feedback : '');
    // Restore rubric scores from saved feedback.rubric
    const savedRubric = attempt.feedback?.rubric;
    if (savedRubric && typeof savedRubric === 'object' && 'criteria' in savedRubric) {
      const criteriaScores: Record<string, number> = {};
      for (const c of (savedRubric as { criteria: { criterion_id: string; score: number }[] }).criteria) {
        criteriaScores[c.criterion_id] = c.score;
      }
      setRubricScores(criteriaScores);
    } else {
      setRubricScores({});
    }
  }

  async function openFile(attemptFileUuid: string) {
    try {
      const result = await getFileSubmissionFileUrl(attemptFileUuid);
      window.open(result.get_url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open file');
    }
  }

  async function previewFile(attemptFileUuid: string, filename: string) {
    setIsFetchingPreview(attemptFileUuid);
    try {
      const result = await getFileSubmissionFileUrl(attemptFileUuid);
      setPreviewUrl(result.get_url);
      setPreviewFilename(filename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to preview file');
    } finally {
      setIsFetchingPreview(null);
    }
  }

  if (isConfigLoading || isQueueLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading submissions
      </div>
    );
  }

  if (!config || !queue) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">Review is unavailable.</div>
    );
  }

  return (
    <div className="bg-background grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="border-border bg-card/40 border-r">
        <div className="border-border sticky top-0 z-10 space-y-3 border-b bg-inherit p-4 backdrop-blur">
          <div>
            <p className="text-muted-foreground text-xs">File Submission Review</p>
            <h1 className="truncate text-lg font-semibold">{config.title}</h1>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search learners"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                config &&
                queryClient.invalidateQueries({
                  queryKey: queueQueryKey(config.file_submission_uuid),
                })
              }
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={fileSubmissionExportUrl(config.file_submission_uuid)} />}
            >
              <Download className="size-4" />
              CSV
            </Button>
          </div>
        </div>
        <div className="divide-border divide-y">
          {filteredItems.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">No submissions match this view.</p>
          ) : (
            filteredItems.map((attempt) => (
              <button
                type="button"
                key={attempt.attempt_uuid}
                className={`hover:bg-muted/60 block w-full p-4 text-left transition-colors ${
                  selected?.attempt_uuid === attempt.attempt_uuid ? 'bg-muted' : ''
                }`}
                onClick={() => selectAttempt(attempt)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayUser(attempt)}</p>
                    <p className="text-muted-foreground text-xs">
                      Attempt {attempt.attempt_number} · {attempt.files.length} file
                      {attempt.files.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <AttemptStatusBadge status={attempt.status} />
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="p-4 lg:p-6">
        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{displayUser(selected)}</h2>
                  <p className="text-muted-foreground text-sm">
                    Submitted {selected.submitted_at ? formatDate(selected.submitted_at) : 'as draft'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.is_late ? <Badge variant="destructive">Late</Badge> : null}
                  {selected.final_score !== null ? <Badge variant="outline">{selected.final_score}%</Badge> : null}
                  <AttemptStatusBadge status={selected.status} />
                </div>
              </div>
              <div className="divide-border rounded-md border">
                {selected.files.length === 0 ? (
                  <p className="text-muted-foreground p-4 text-sm">No files attached.</p>
                ) : (
                  selected.files.map((file) => {
                    const previewable = isPreviewable(file.filename);
                    return (
                      <div
                        key={file.attempt_file_uuid}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="text-muted-foreground size-5 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{file.filename}</p>
                            <p className="text-muted-foreground text-xs">
                              {formatBytes(file.size_bytes ?? 0)} · {file.scan_status.toLowerCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {previewable && (
                            <Button
                              size="sm"
                              variant={previewUrl !== null && previewFilename === file.filename ? 'default' : 'outline'}
                              disabled={isFetchingPreview === file.attempt_file_uuid}
                              onClick={() => {
                                if (previewUrl !== null && previewFilename === file.filename) {
                                  setPreviewUrl(null);
                                  setPreviewFilename(null);
                                } else {
                                  previewFile(file.attempt_file_uuid, file.filename);
                                }
                              }}
                            >
                              {isFetchingPreview === file.attempt_file_uuid ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                              Preview
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openFile(file.attempt_file_uuid)}
                          >
                            {previewable ? <ExternalLink className="size-4" /> : <Download className="size-4" />}
                            {previewable ? 'Open' : 'Download'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── Inline file preview ──────────────────────────────────── */}
              {previewUrl && (
                <div className="rounded-md border">
                  <div className="flex items-center justify-between border-b p-3">
                    <p className="truncate text-sm font-medium">{previewFilename}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={() => {
                        setPreviewUrl(null);
                        setPreviewFilename(null);
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <FilePreviewPane
                    url={previewUrl}
                    filename={previewFilename ?? ''}
                  />
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="rounded-md border p-4">
                <h3 className="mb-3 text-sm font-semibold">Grade and feedback</h3>
                <div className="space-y-3">
                  {/* ── Rubric grid (shown when rubric criteria are defined) ── */}
                  {parsedCriteria.length > 0 && (
                    <RubricGrid
                      criteria={parsedCriteria}
                      scores={rubricScores}
                      onChange={(criterionId, criterionScore) => {
                        setRubricScores((prev) => ({ ...prev, [criterionId]: criterionScore }));
                        // Auto-fill overall score from rubric total
                        const newScores = { ...rubricScores, [criterionId]: criterionScore };
                        const total = parsedCriteria.reduce((acc, c) => acc + (newScores[c.criterion_id] ?? 0), 0);
                        const maxTotal = parsedCriteria.reduce((acc, c) => acc + c.max_score, 0);
                        if (maxTotal > 0) {
                          setScore(String(Math.round((total / maxTotal) * 100)));
                        }
                      }}
                    />
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="fs-review-score">Final score</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="fs-review-score"
                        type="number"
                        min={0}
                        max={100}
                        value={score}
                        onChange={(event) => setScore(event.target.value)}
                        placeholder="0–100"
                        className="w-24"
                      />
                      <span className="text-muted-foreground text-sm">/ 100</span>
                      {rubricTotalScore !== null && (
                        <Button
                          type="button"
                          size="sm"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => setScore(String(rubricTotalScore))}
                        >
                          Use rubric total ({rubricTotalScore})
                        </Button>
                      )}
                    </div>
                  </div>
                  <Textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    className="min-h-36"
                    placeholder="Feedback"
                  />
                  <div className="grid gap-2">
                    <Button
                      onClick={() => gradeMutation.mutate({ status: 'GRADED' })}
                      disabled={gradeMutation.isPending}
                    >
                      {gradeMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Save grade
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => gradeMutation.mutate({ status: 'RETURNED' })}
                      disabled={gradeMutation.isPending}
                    >
                      <RotateCcw className="size-4" />
                      Return for revision
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => gradeMutation.mutate({ status: 'PUBLISHED' })}
                      disabled={gradeMutation.isPending}
                    >
                      Publish result
                    </Button>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">Select a submission.</div>
        )}
      </main>
    </div>
  );
}

function displayUser(attempt: FileSubmissionAttempt) {
  const { user } = attempt;
  const fullName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();
  return fullName || user?.username || user?.email || 'Learner';
}

function isPreviewable(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

function RubricGrid({
  criteria,
  scores,
  onChange,
}: {
  criteria: RubricCriterion[];
  scores: Record<string, number>;
  onChange: (criterionId: string, score: number) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Rubric</p>
      {criteria.map((c) => {
        const current = scores[c.criterion_id] ?? null;
        return (
          <div
            key={c.criterion_id}
            className="space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">{c.label}</span>
              <span className="text-muted-foreground text-xs">
                {current ?? '—'} / {c.max_score}
              </span>
            </div>
            {c.levels && c.levels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {c.levels.map((level) => (
                  <button
                    key={level.score}
                    type="button"
                    title={level.description}
                    className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                      current === level.score ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                    }`}
                    onClick={() => onChange(c.criterion_id, level.score)}
                  >
                    {level.label} ({level.score})
                  </button>
                ))}
              </div>
            ) : (
              <Input
                type="number"
                min={0}
                max={c.max_score}
                step={0.5}
                value={current ?? ''}
                placeholder="0"
                className="h-7 w-20 text-sm"
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  if (!Number.isNaN(v)) onChange(c.criterion_id, Math.min(v, c.max_score));
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilePreviewPane({ url, filename }: { url: string; filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={filename}
        className="max-h-[600px] w-full rounded-b-md object-contain p-2"
      />
    );
  }
  // PDF / fallback iframe
  return (
    <iframe
      src={url}
      title={filename}
      className="h-[600px] w-full rounded-b-md border-0"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

function AttemptStatusBadge({ status }: { status: string }) {
  const variant = status === 'SUBMITTED' ? 'default' : status === 'RETURNED' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{status.toLowerCase()}</Badge>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
