'use client'

import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { CourseStructureMode, CourseInitialVisibility, CourseCreateDestination } from './course-create-types'

interface CourseCreateReviewPanelProps {
  title: string
  structureMode: CourseStructureMode
  sourceCourseUuid: string
  initialVisibility: CourseInitialVisibility
  destination: CourseCreateDestination
  completedCount: number
  totalRequired: number
  blockingReason: string | null
  isPending: boolean
  onSubmit: () => void
  onCancel: () => void
}

export function CourseCreateReviewPanel({
  title,
  structureMode,
  sourceCourseUuid,
  initialVisibility,
  destination,
  completedCount,
  totalRequired,
  blockingReason,
  isPending,
  onSubmit,
  onCancel,
}: CourseCreateReviewPanelProps) {
  const t = useTranslations('DashPage.CourseManagement.Create')

  const structureLabel =
    structureMode === 'starter'
      ? t('structure.starter.title')
      : structureMode === 'copy-outline'
        ? t('structure.copyOutline.title')
        : t('structure.blank.title')

  const visibilityLabel = initialVisibility === 'public' ? t('visibility.public.title') : t('visibility.private.title')

  const destinationLabel =
    destination === 'curriculum' ? t('destination.curriculum.title') : t('destination.overview.title')

  const allComplete = blockingReason === null

  const blockedReasonText = blockingReason
    ? blockingReason === 'title'
      ? t('review.blockingReasons.title')
      : blockingReason === 'description'
        ? t('review.blockingReasons.description')
        : blockingReason === 'source'
          ? t('review.blockingReasons.source')
          : null
    : null

  return (
    <div className="bg-card flex flex-col gap-4 rounded-lg border p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground text-sm font-semibold">{t('review.heading')}</h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {completedCount}/{totalRequired}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <ReviewRow
          label={t('review.rows.title')}
          value={title.trim() || null}
          emptyText={t('review.rows.titleEmpty')}
        />
        <ReviewRow label={t('review.rows.structure')} value={structureLabel} />
        {structureMode === 'copy-outline' && (
          <ReviewRow
            label={t('review.rows.source')}
            value={sourceCourseUuid ? t('review.rows.sourceSelected') : null}
            emptyText={t('review.rows.sourceEmpty')}
          />
        )}
        <ReviewRow label={t('review.rows.visibility')} value={visibilityLabel} />
        <ReviewRow label={t('review.rows.destination')} value={destinationLabel} />
      </div>

      <Separator />

      {blockedReasonText && (
        <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
          {blockedReasonText}
        </p>
      )}

      <Button type="submit" disabled={!allComplete || isPending} onClick={onSubmit} className="w-full">
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            {t('actions.creating')}
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 size-4" aria-hidden />
            {t('actions.create')}
          </>
        )}
      </Button>

      <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending} className="w-full">
        {t('actions.cancel')}
      </Button>
    </div>
  )
}

function ReviewRow({ label, value, emptyText }: { label: string; value: string | null; emptyText?: string }) {
  const filled = Boolean(value)
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{label}</span>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 text-xs',
          filled ? 'text-foreground' : 'text-muted-foreground/60',
        )}
      >
        {filled ? (
          <CheckCircle2 className="text-primary size-3" aria-hidden />
        ) : (
          <Circle className="size-3" aria-hidden />
        )}
        <span className="max-w-[120px] truncate">{filled ? value : (emptyText ?? '—')}</span>
      </span>
    </div>
  )
}
