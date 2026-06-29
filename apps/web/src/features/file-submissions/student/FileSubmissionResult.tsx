'use client'

import { CheckCircle2, MessageSquare, RotateCcw, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FileSubmissionAttempt } from '@/features/file-submissions/services/file-submissions'
import { MarkdownContent } from '@/features/content-markdown'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '-'
  return `${Math.round(score * 100) / 100}%`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FileSubmissionResultProps {
  attempt: FileSubmissionAttempt
  /** Called when the student chooses to revise. Only shown when status=RETURNED. */
  onRevise?: () => void
}

/**
 * Grade result card shown when the submission has been graded/published.
 * Shows score, late deduction, teacher feedback, and revision CTA.
 */
export default function FileSubmissionResult({ attempt, onRevise }: FileSubmissionResultProps) {
  const t = useTranslations('FileSubmission')
  const { status, final_score, late_penalty_pct, feedback } = attempt
  const isReturned = status === 'RETURNED'
  const passing = final_score !== null && final_score !== undefined && final_score >= 60
  const feedbackText = typeof feedback?.feedback === 'string' ? feedback.feedback : null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Score block */}
      <div className="bg-muted/30 border-border flex items-center justify-between gap-4 rounded-xl border p-6">
        <div>
          <p className="text-muted-foreground text-sm">{t('yourScore')}</p>
          <p className="text-4xl font-bold tabular-nums">{formatScore(final_score)}</p>
          {late_penalty_pct > 0 ? (
            <p className="text-muted-foreground mt-1 text-xs">{t('latePenalty', { percent: late_penalty_pct })}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {isReturned ? (
            <Badge variant="outline" className="gap-1.5 border-amber-500 text-amber-600 dark:text-amber-400">
              <RotateCcw className="size-3" />
              {t('returnedForRevision')}
            </Badge>
          ) : passing ? (
            <Badge variant="outline" className="border-primary text-primary gap-1.5">
              <CheckCircle2 className="size-3" />
              {t('passed')}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-destructive text-destructive gap-1.5">
              <XCircle className="size-3" />
              {t('failed')}
            </Badge>
          )}
        </div>
      </div>

      {/* Feedback */}
      {feedbackText ? (
        <div className="border-border bg-muted/20 rounded-xl border p-5">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="size-4" />
            {t('teacherFeedback')}
          </h4>
          <MarkdownContent content={feedbackText} mode="compactRichText" />
        </div>
      ) : null}

      {/* Revision CTA */}
      {isReturned && onRevise ? (
        <div className="flex justify-end">
          <Button type="button" onClick={onRevise}>
            <RotateCcw className="size-4" />
            {t('startRevision')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
