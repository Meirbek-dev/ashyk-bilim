'use client'

import { ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  SUBMISSION_STATUS_LABELS,
  getReleaseState,
  getSubmissionDisplayName,
  needsTeacherAction,
} from '@/features/grading/domain'
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { StatusFilter, SubmissionListProps } from '../types'

export default function SubmissionList({
  submissions,
  total,
  pages,
  page,
  activeFilter,
  search,
  sortBy,
  isLoading,
  selectedUuid,
  selectedUuids,
  onFilterChange,
  onSearchChange,
  onSortChange,
  onPageChange,
  onSelectSubmission,
  onToggleSelected,
}: SubmissionListProps) {
  const t = useTranslations('Features.Grading.Review.submissionList')
  const tReview = useTranslations('Features.Grading.Review')
  const tTable = useTranslations('Grading.Table')
  const locale = useLocale()

  return (
    <aside className="bg-muted/20 border-b p-4 lg:border-r lg:border-b-0">
      <div className="space-y-3">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder={t('searchLearner')}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect
            value={activeFilter}
            onChange={event => onFilterChange(event.target.value as StatusFilter)}
            aria-label={t('statusFilter')}
          >
            <NativeSelectOption value="ALL">{t('filters.all')}</NativeSelectOption>
            <NativeSelectOption value="NEEDS_GRADING">{t('filters.needsGrading')}</NativeSelectOption>
            <NativeSelectOption value="PENDING">{tTable(SUBMISSION_STATUS_LABELS.PENDING)}</NativeSelectOption>
            <NativeSelectOption value="GRADED">{tTable(SUBMISSION_STATUS_LABELS.GRADED)}</NativeSelectOption>
            <NativeSelectOption value="PUBLISHED">{tTable(SUBMISSION_STATUS_LABELS.PUBLISHED)}</NativeSelectOption>
            <NativeSelectOption value="RETURNED">{tTable(SUBMISSION_STATUS_LABELS.RETURNED)}</NativeSelectOption>
          </NativeSelect>
          <NativeSelect value={sortBy} onChange={event => onSortChange(event.target.value)} aria-label={t('sort')}>
            <NativeSelectOption value="submitted_at">{t('sorting.submitted')}</NativeSelectOption>
            <NativeSelectOption value="final_score">{t('sorting.score')}</NativeSelectOption>
            <NativeSelectOption value="attempt_number">{t('sorting.attempt')}</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
        <span>{t('totals.submissions', { count: total })}</span>
        <span>{t('totals.selected', { count: selectedUuids.size })}</span>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t('loading')}
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">{t('empty')}</div>
        ) : (
          submissions.map(submission => {
            const selected = submission.submission_uuid === selectedUuid
            const displayName = getSubmissionDisplayName(submission)
            const releaseState = getReleaseState(submission.status)
            return (
              <div
                key={submission.submission_uuid}
                className={cn(
                  'rounded-md border bg-background p-3 transition hover:bg-muted/60',
                  selected && 'border-primary ring-primary/20 ring-2',
                )}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedUuids.has(submission.submission_uuid)}
                    onCheckedChange={checked => onToggleSelected(submission.submission_uuid, checked)}
                    aria-label={t('selectSubmission', { name: displayName })}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onSelectSubmission(submission.submission_uuid)}
                  >
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {submission.user?.email ?? `User #${submission.user_id}`}
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        {t('attemptNumber', {
                          number: submission.attempt_number,
                        })}
                      </span>
                      <span>{formatDate(submission.submitted_at ?? submission.updated_at, locale, t)}</span>
                      {typeof submission.final_score === 'number' ? (
                        <span>{Math.round(submission.final_score)}%</span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <SubmissionStatusBadge status={submission.status} />
                      <Badge variant="outline">
                        {releaseState === 'HIDDEN'
                          ? tReview('releaseStateHidden')
                          : releaseState === 'AWAITING_RELEASE'
                            ? tReview('releaseStateAwaitingRelease')
                            : releaseState === 'VISIBLE'
                              ? tReview('releaseStateVisible')
                              : tReview('releaseStateReturned')}
                      </Badge>
                      {submission.is_late ? <Badge variant="destructive">{t('late')}</Badge> : null}
                      {needsTeacherAction(submission.status) ? <Badge variant="warning">{t('action')}</Badge> : null}
                    </div>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(current => current - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(current => current + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
    </aside>
  )
}

function formatDate(
  value: string | null | undefined,
  locale: string,
  t: ReturnType<typeof useTranslations<'Features.Grading.Review.submissionList'>>,
) {
  if (!value) return t('unsubmitted')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
