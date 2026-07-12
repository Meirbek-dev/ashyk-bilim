'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Eye, FileText, Loader2, RefreshCw, RotateCcw, Search, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { WidgetErrorBoundary } from '@/components/ui/widget-error-boundary'
import { MarkdownEditor } from '@/features/content-markdown'
import { useApiError } from '@/hooks/useApiError'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  fileSubmissionExportUrl,
  getFileSubmissionByActivity,
  getFileSubmissionFileUrl,
  getFileSubmissionReviewAttempt,
  getFileSubmissionReviewQueue,
  gradeFileSubmissionAttempt,
} from '@/features/file-submissions/services/file-submissions'
import type {
  FileSubmissionAttempt,
  FileSubmissionAttemptStatus,
} from '@/features/file-submissions/services/file-submissions'
import { usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

// ── Rubric types (convention-based schema stored in rubric_json) ──────────────

interface RubricCriterionLevel {
  label: string
  score: number
  description?: string
}

interface RubricCriterion {
  criterion_id: string
  label: string
  max_score: number
  levels?: RubricCriterionLevel[]
}

function parseRubricCriteria(rubric: Record<string, unknown>): RubricCriterion[] {
  const { criteria } = rubric as { criteria?: unknown }
  if (!Array.isArray(criteria)) return []
  return criteria.filter(
    (c): c is RubricCriterion =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as RubricCriterion).criterion_id === 'string' &&
      typeof (c as RubricCriterion).label === 'string',
  )
}

interface FileSubmissionReviewWorkspaceProps {
  activityUuid: string
  initialAttemptUuid?: string | null
}

const activityQueryKey = (activityUuid: string) => ['file-submission', 'review-activity', activityUuid] as const
const PAGE_SIZE = 25
type QueueStatus = FileSubmissionAttemptStatus | 'ALL'

const queueQueryKey = (fileSubmissionUuid: string) => ['file-submission', 'review-queue', fileSubmissionUuid] as const
const queuePageQueryKey = (fileSubmissionUuid: string, status: QueueStatus, search: string, page: number) =>
  [...queueQueryKey(fileSubmissionUuid), { status, search, page, pageSize: PAGE_SIZE }] as const

function parseQueueStatus(value: string | null): QueueStatus {
  return value === 'DRAFT' ||
    value === 'SUBMITTED' ||
    value === 'GRADED' ||
    value === 'PUBLISHED' ||
    value === 'RETURNED'
    ? value
    : 'ALL'
}

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default function FileSubmissionReviewWorkspace({
  activityUuid,
  initialAttemptUuid,
}: FileSubmissionReviewWorkspaceProps) {
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '')
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const urlSearchParams = useSearchParams()
  const [search, setSearch] = useState(() => urlSearchParams.get('search') ?? '')
  const deferredSearch = useDeferredValue(search.trim())
  const [status, setStatus] = useState<QueueStatus>(() => parseQueueStatus(urlSearchParams.get('status')))
  const [page, setPage] = useState(() => parsePage(urlSearchParams.get('page')))
  const [selectedUuid, setSelectedUuid] = useState<string | null>(initialAttemptUuid ?? null)
  const [pendingAttempt, setPendingAttempt] = useState<FileSubmissionAttempt | null>(null)
  const [isGradeDirty, setIsGradeDirty] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState<string | null>(null)
  const [isFetchingPreview, setIsFetchingPreview] = useState<string | null>(null) // attemptFileUuid
  const t = useTranslations('FileSubmissionReview')
  const { handleApiError, toastApiError } = useApiError()
  const navigationGuard = useUnsavedChangesGuard(isGradeDirty, {
    message: t('unsavedDescription'),
    interceptInAppNavigation: true,
  })

  const {
    data: config,
    error: configError,
    isError: isConfigError,
    isLoading: isConfigLoading,
    refetch: refetchConfig,
  } = useQuery(
    queryOptions({
      queryKey: activityQueryKey(cleanActivityUuid),
      queryFn: () => getFileSubmissionByActivity(cleanActivityUuid),
      enabled: Boolean(cleanActivityUuid),
    }),
  )

  useEffect(() => {
    const next = new URLSearchParams(urlSearchParams.toString())
    if (deferredSearch) next.set('search', deferredSearch)
    else next.delete('search')
    if (status === 'ALL') next.delete('status')
    else next.set('status', status)
    if (page === 1) next.delete('page')
    else next.set('page', String(page))

    const current = urlSearchParams.toString()
    const nextValue = next.toString()
    if (nextValue !== current) {
      router.replace(nextValue ? `${pathname}?${nextValue}` : pathname, { scroll: false })
    }
  }, [deferredSearch, page, pathname, router, status, urlSearchParams])

  const {
    data: queue,
    error: queueError,
    isError: isQueueError,
    isLoading: isQueueLoading,
    refetch: refetchQueue,
  } = useQuery(
    queryOptions({
      queryKey: config
        ? queuePageQueryKey(config.file_submission_uuid, status, deferredSearch, page)
        : ['file-submission', 'review-queue', 'pending'],
      queryFn: () =>
        getFileSubmissionReviewQueue(config!.file_submission_uuid, {
          status,
          search: deferredSearch,
          page,
          pageSize: PAGE_SIZE,
        }),
      enabled: Boolean(config?.file_submission_uuid),
      placeholderData: previous => previous,
    }),
  )

  const { data: linkedAttempt } = useQuery(
    queryOptions({
      queryKey:
        config && initialAttemptUuid
          ? ['file-submission', 'review-attempt', config.file_submission_uuid, initialAttemptUuid]
          : ['file-submission', 'review-attempt', 'pending'],
      queryFn: () => getFileSubmissionReviewAttempt(config!.file_submission_uuid, initialAttemptUuid!),
      enabled: Boolean(config?.file_submission_uuid && initialAttemptUuid),
    }),
  )

  const queueItems = queue?.items ?? []
  const selected =
    queueItems.find(attempt => attempt.attempt_uuid === selectedUuid) ??
    (linkedAttempt?.attempt_uuid === selectedUuid ? linkedAttempt : null) ??
    queueItems[0] ??
    null

  const gradeMutation = useMutation({
    mutationFn: async ({
      attempt,
      payload,
    }: {
      attempt: FileSubmissionAttempt
      payload: Parameters<typeof gradeFileSubmissionAttempt>[2]
    }) => {
      if (!config) throw new Error('Submission is unavailable')
      return await gradeFileSubmissionAttempt(
        config.file_submission_uuid,
        attempt.attempt_uuid,
        payload,
        attempt.version,
      )
    },
    onSuccess: async () => {
      if (config)
        await queryClient.invalidateQueries({
          queryKey: queueQueryKey(config.file_submission_uuid),
        })
      toast.success(t('submissionUpdated'))
    },
    onError: gradeError => {
      setIsGradeDirty(true)
      toastApiError(gradeError, { fallback: t('updateSubmissionFailed') })
    },
  })

  const parsedCriteria = config?.rubric ? parseRubricCriteria(config.rubric) : []

  function selectAttempt(attempt: FileSubmissionAttempt) {
    setSelectedUuid(attempt.attempt_uuid)
    setIsGradeDirty(false)
    setPreviewUrl(null)
    setPreviewFilename(null)
    const next = new URLSearchParams(urlSearchParams.toString())
    next.set('submission', attempt.attempt_uuid)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  function requestAttemptSelection(attempt: FileSubmissionAttempt) {
    if (attempt.attempt_uuid === selected?.attempt_uuid) return
    if (isGradeDirty) {
      setPendingAttempt(attempt)
      return
    }
    selectAttempt(attempt)
  }

  async function openFile(attemptFileUuid: string) {
    try {
      const result = await getFileSubmissionFileUrl(attemptFileUuid)
      window.open(result.get_url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toastApiError(error, { fallback: t('openFileFailed') })
    }
  }

  async function previewFile(attemptFileUuid: string, filename: string) {
    setIsFetchingPreview(attemptFileUuid)
    try {
      const result = await getFileSubmissionFileUrl(attemptFileUuid)
      setPreviewUrl(result.get_url)
      setPreviewFilename(filename)
    } catch (error) {
      toastApiError(error, { fallback: t('previewFileFailed') })
    } finally {
      setIsFetchingPreview(null)
    }
  }

  if (isConfigLoading || isQueueLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {t('loadingSubmissions')}
      </div>
    )
  }

  if (isConfigError || isQueueError) {
    const sourceError = configError ?? queueError
    const processed = handleApiError(sourceError, { fallback: t('reviewUnavailable') })
    return (
      <ErrorState
        actionLabel={processed.actionLabel}
        description={processed.message}
        error={sourceError}
        {...(processed.showRetry
          ? {
              onAction: () => {
                void (isConfigError ? refetchConfig() : refetchQueue())
              },
            }
          : {})}
        title={t('reviewUnavailable')}
        variant="section"
      />
    )
  }

  if (!config || !queue) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">{t('reviewUnavailable')}</div>
    )
  }

  return (
    <div className="bg-background grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="border-border bg-card/40 border-b lg:border-r lg:border-b-0">
        <div className="border-border sticky top-0 z-10 flex flex-col gap-3 border-b bg-inherit p-4 backdrop-blur">
          <div>
            <p className="text-muted-foreground text-xs">{t('fileSubmissionReview')}</p>
            <h1 className="truncate text-lg font-semibold">{config.title}</h1>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
            <Input
              aria-label={t('searchLearners')}
              autoComplete="off"
              name="learner-search"
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={t('searchLearnersPlaceholder')}
              className="pl-8"
            />
          </div>
          <Label htmlFor="file-review-status" className="sr-only">
            {t('filterByStatus')}
          </Label>
          <NativeSelect
            id="file-review-status"
            className="w-full"
            value={status}
            onChange={event => {
              setStatus(parseQueueStatus(event.target.value))
              setPage(1)
            }}
          >
            <NativeSelectOption value="ALL">{t('allStatuses')}</NativeSelectOption>
            <NativeSelectOption value="SUBMITTED">{t('statusSubmitted')}</NativeSelectOption>
            <NativeSelectOption value="GRADED">{t('statusGraded')}</NativeSelectOption>
            <NativeSelectOption value="PUBLISHED">{t('statusPublished')}</NativeSelectOption>
            <NativeSelectOption value="RETURNED">{t('statusReturned')}</NativeSelectOption>
            <NativeSelectOption value="DRAFT">{t('statusDraft')}</NativeSelectOption>
          </NativeSelect>
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
              <RefreshCw data-icon="inline-start" />
              {t('refresh')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={fileSubmissionExportUrl(config.file_submission_uuid)} aria-label={t('downloadCsv')} />}
            >
              <Download data-icon="inline-start" />
              CSV
            </Button>
          </div>
        </div>
        <div className="divide-border max-h-64 divide-y overflow-y-auto overscroll-contain lg:max-h-none">
          {queueItems.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">{t('noSubmissions')}</p>
          ) : (
            queueItems.map(attempt => (
              <Button
                type="button"
                key={attempt.attempt_uuid}
                variant="ghost"
                className={cn(
                  'hover:bg-muted/60 h-auto w-full justify-start rounded-none p-4 text-left transition-colors',
                  selected?.attempt_uuid === attempt.attempt_uuid && 'bg-muted',
                )}
                onClick={() => requestAttemptSelection(attempt)}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayUser(attempt)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('attemptInfo', {
                        attemptNumber: attempt.attempt_number,
                        count: attempt.files.length,
                      })}
                    </p>
                  </div>
                  <AttemptStatusBadge status={attempt.status} />
                </div>
              </Button>
            ))
          )}
        </div>
        {queue.total > PAGE_SIZE ? (
          <div className="border-border border-t p-3">
            <Pagination>
              <PaginationContent className="w-full justify-between">
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={page <= 1}
                    className={cn(page <= 1 && 'pointer-events-none opacity-50')}
                    href={buildQueuePageHref(urlSearchParams, pathname, Math.max(1, page - 1))}
                    onClick={event => {
                      event.preventDefault()
                      if (page > 1) setPage(page - 1)
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="text-muted-foreground px-2 text-sm tabular-nums">
                    {t('pageOf', { page, pages: Math.max(1, Math.ceil(queue.total / PAGE_SIZE)) })}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={page * PAGE_SIZE >= queue.total}
                    className={cn(page * PAGE_SIZE >= queue.total && 'pointer-events-none opacity-50')}
                    href={buildQueuePageHref(urlSearchParams, pathname, page + 1)}
                    onClick={event => {
                      event.preventDefault()
                      if (page * PAGE_SIZE < queue.total) setPage(page + 1)
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </aside>

      <main className="p-4 lg:p-6">
        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{displayUser(selected)}</h2>
                  <p className="text-muted-foreground text-sm">
                    {selected.submitted_at
                      ? t('submittedAt', {
                          date: formatDate(selected.submitted_at),
                        })
                      : t('submittedAsDraft')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.is_late ? <Badge variant="destructive">{t('late')}</Badge> : null}
                  {selected.final_score !== null ? <Badge variant="outline">{selected.final_score}%</Badge> : null}
                  <AttemptStatusBadge status={selected.status} />
                </div>
              </div>
              <div className="divide-border rounded-md border">
                {selected.files.length === 0 ? (
                  <p className="text-muted-foreground p-4 text-sm">{t('noFiles')}</p>
                ) : (
                  selected.files.map(file => {
                    const previewable = isPreviewable(file.filename)
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
                                  setPreviewUrl(null)
                                  setPreviewFilename(null)
                                } else {
                                  previewFile(file.attempt_file_uuid, file.filename)
                                }
                              }}
                            >
                              {isFetchingPreview === file.attempt_file_uuid ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                              {t('preview')}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => openFile(file.attempt_file_uuid)}>
                            {previewable ? <ExternalLink className="size-4" /> : <Download className="size-4" />}
                            {previewable ? t('openButton') : t('downloadButton')}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* ── Inline file preview ──────────────────────────────────── */}
              {previewUrl && (
                <WidgetErrorBoundary scope="file-submission-preview" variant="section" title={t('previewFileFailed')}>
                  <div className="rounded-md border">
                    <div className="flex items-center justify-between border-b p-3">
                      <p className="truncate text-sm font-medium">{previewFilename}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        onClick={() => {
                          setPreviewUrl(null)
                          setPreviewFilename(null)
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <FilePreviewPane url={previewUrl} filename={previewFilename ?? ''} />
                  </div>
                </WidgetErrorBoundary>
              )}
            </section>

            <aside className="space-y-4">
              <GradeEditor
                key={selected.attempt_uuid}
                attempt={selected}
                criteria={parsedCriteria}
                isPending={gradeMutation.isPending}
                onDirtyChange={setIsGradeDirty}
                onSubmit={payload => {
                  setIsGradeDirty(false)
                  gradeMutation.mutate({ attempt: selected, payload })
                }}
              />
            </aside>
          </div>
        ) : (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            {t('selectSubmission')}
          </div>
        )}
      </main>
      <AlertDialog open={pendingAttempt !== null} onOpenChange={open => (!open ? setPendingAttempt(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discardDraftTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('discardDraftDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingAttempt) selectAttempt(pendingAttempt)
                setPendingAttempt(null)
              }}
            >
              {t('discardAndSwitch')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={navigationGuard.isPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{navigationGuard.promptMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={navigationGuard.cancelNavigation}>{t('stayHere')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setIsGradeDirty(false)
                navigationGuard.confirmNavigation()
              }}
            >
              {t('leaveWithoutSaving')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function displayUser(attempt: FileSubmissionAttempt) {
  const { user } = attempt
  const fullName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim()
  return fullName || user?.username || user?.email || 'Learner'
}

function buildQueuePageHref(searchParams: Readonly<URLSearchParams>, pathname: string, page: number): string {
  const next = new URLSearchParams(searchParams.toString())
  if (page <= 1) next.delete('page')
  else next.set('page', String(page))
  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}

function readRubricScores(attempt: FileSubmissionAttempt): Record<string, number> {
  const savedRubric = attempt.feedback?.rubric
  if (!savedRubric || typeof savedRubric !== 'object' || !('criteria' in savedRubric)) return {}
  const rawCriteria = (savedRubric as { criteria?: unknown }).criteria
  if (!Array.isArray(rawCriteria)) return {}

  return rawCriteria.reduce<Record<string, number>>((scores, criterion) => {
    if (
      criterion &&
      typeof criterion === 'object' &&
      typeof (criterion as { criterion_id?: unknown }).criterion_id === 'string' &&
      typeof (criterion as { score?: unknown }).score === 'number'
    ) {
      scores[(criterion as { criterion_id: string }).criterion_id] = (criterion as { score: number }).score
    }
    return scores
  }, {})
}

function GradeEditor({
  attempt,
  criteria,
  isPending,
  onDirtyChange,
  onSubmit,
}: {
  attempt: FileSubmissionAttempt
  criteria: RubricCriterion[]
  isPending: boolean
  onDirtyChange: (dirty: boolean) => void
  onSubmit: (payload: Parameters<typeof gradeFileSubmissionAttempt>[2]) => void
}) {
  const t = useTranslations('FileSubmissionReview')
  const [score, setScore] = useState(attempt.final_score === null ? '' : String(attempt.final_score))
  const [feedback, setFeedback] = useState(
    typeof attempt.feedback?.feedback === 'string' ? attempt.feedback.feedback : '',
  )
  const [rubricScores, setRubricScores] = useState<Record<string, number>>(() => readRubricScores(attempt))
  const rubricTotalScore =
    criteria.length === 0
      ? null
      : criteria.reduce((total, criterion) => total + (rubricScores[criterion.criterion_id] ?? 0), 0)
  const scoreId = `fs-review-score-${attempt.attempt_uuid}`

  function submit(status: 'GRADED' | 'PUBLISHED' | 'RETURNED') {
    const rubric =
      criteria.length > 0
        ? {
            criteria: criteria.map(criterion => ({
              criterion_id: criterion.criterion_id,
              label: criterion.label,
              score: rubricScores[criterion.criterion_id] ?? 0,
              max_score: criterion.max_score,
            })),
          }
        : {}
    onSubmit({
      final_score: score.trim() === '' ? null : Number(score),
      feedback,
      rubric,
      status,
    })
  }

  return (
    <section className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('gradeAndFeedback')}</h3>
      <div className="flex flex-col gap-3">
        {criteria.length > 0 ? (
          <RubricGrid
            criteria={criteria}
            scores={rubricScores}
            onChange={(criterionId, criterionScore) => {
              const nextScores = { ...rubricScores, [criterionId]: criterionScore }
              setRubricScores(nextScores)
              onDirtyChange(true)
              const total = criteria.reduce((sum, criterion) => sum + (nextScores[criterion.criterion_id] ?? 0), 0)
              const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.max_score, 0)
              if (maxTotal > 0) setScore(String(Math.round((total / maxTotal) * 100)))
            }}
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={scoreId}>{t('finalScore')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={scoreId}
              name="final-score"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              value={score}
              onChange={event => {
                setScore(event.target.value)
                onDirtyChange(true)
              }}
              placeholder={t('scorePlaceholder')}
              className="w-24 tabular-nums"
            />
            <span className="text-muted-foreground text-sm">{t('scoreSlash')}</span>
            {rubricTotalScore !== null ? (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  setScore(String(rubricTotalScore))
                  onDirtyChange(true)
                }}
              >
                {t('useRubricTotal', { score: rubricTotalScore })}
              </Button>
            ) : null}
          </div>
        </div>
        <MarkdownEditor
          value={feedback}
          onChange={value => {
            setFeedback(value)
            onDirtyChange(true)
          }}
          preset="explanation"
          minHeight={160}
          placeholder={t('feedbackPlaceholder')}
        />
        <div className="grid gap-2">
          <Button onClick={() => submit('GRADED')} disabled={isPending}>
            {isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            {t('saveGrade')}
          </Button>
          <Button variant="outline" onClick={() => submit('RETURNED')} disabled={isPending}>
            <RotateCcw data-icon="inline-start" />
            {t('returnForRevision')}
          </Button>
          <Button variant="outline" onClick={() => submit('PUBLISHED')} disabled={isPending}>
            {t('publishResult')}
          </Button>
        </div>
      </div>
    </section>
  )
}

function isPreviewable(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
}

function RubricGrid({
  criteria,
  scores,
  onChange,
}: {
  criteria: RubricCriterion[]
  scores: Record<string, number>
  onChange: (criterionId: string, score: number) => void
}) {
  const t = useTranslations('FileSubmissionReview')
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t('rubric')}</p>
      {criteria.map(c => {
        const current = scores[c.criterion_id] ?? null
        return (
          <div key={c.criterion_id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm">{c.label}</span>
              <span className="text-muted-foreground text-xs">
                {current ?? '—'} / {c.max_score}
              </span>
            </div>
            {c.levels && c.levels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {c.levels.map(level => (
                  <Button
                    key={level.score}
                    type="button"
                    variant={current === level.score ? 'default' : 'outline'}
                    size="sm"
                    title={level.description}
                    className="h-auto px-2 py-0.5 text-xs"
                    onClick={() => onChange(c.criterion_id, level.score)}
                  >
                    {level.label} ({level.score})
                  </Button>
                ))}
              </div>
            ) : (
              <Input
                type="number"
                min={0}
                max={c.max_score}
                step={0.5}
                value={current ?? ''}
                placeholder={t('rubricScorePlaceholder')}
                className="h-7 w-20 text-sm"
                onChange={e => {
                  const v = Number.parseFloat(e.target.value)
                  if (!Number.isNaN(v)) onChange(c.criterion_id, Math.min(v, c.max_score))
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FilePreviewPane({ url, filename }: { url: string; filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={filename} className="max-h-[600px] w-full rounded-b-md object-contain p-2" />
    )
  }
  // PDF / fallback iframe
  return (
    <iframe
      src={url}
      title={filename}
      className="h-[600px] w-full rounded-b-md border-0"
      sandbox="allow-scripts allow-same-origin"
    />
  )
}

function AttemptStatusBadge({ status }: { status: string }) {
  const variant = status === 'SUBMITTED' ? 'default' : status === 'RETURNED' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{status.toLowerCase()}</Badge>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
