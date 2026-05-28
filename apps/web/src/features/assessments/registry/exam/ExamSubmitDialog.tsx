'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface UnansweredQuestion {
  index: number
  id: string
  question_text: string
}

interface ExamSubmitDialogProps {
  open: boolean
  totalQuestions: number
  answeredCount: number
  flaggedCount?: number
  unansweredQuestions?: UnansweredQuestion[]
  isSubmitting: boolean
  labels: {
    confirmSubmission: string
    confirmSubmissionMessage: string
    totalQuestions: string
    answered: string
    unanswered: string
    reviewQuestions: string
    submitting: string
    confirmAndSubmit: string
    unansweredQuestions: string
    flaggedForReview: string
  }
  onCancel: () => void
  onSubmit: () => void
  onNavigateTo?: (index: number) => void
}

export default function ExamSubmitDialog({
  open,
  totalQuestions,
  answeredCount,
  flaggedCount = 0,
  unansweredQuestions = [],
  isSubmitting,
  labels,
  onCancel,
  onSubmit,
  onNavigateTo,
}: ExamSubmitDialogProps) {
  const tQuestion = useTranslations('Features.Assessments.Shared.PostSubmissionFeedback')
  const unansweredCount = totalQuestions - answeredCount
  const hasWarning = unansweredCount > 0 || flaggedCount > 0

  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !nextOpen && onCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia>
            {hasWarning ? (
              <AlertTriangle className="size-6 text-amber-500" />
            ) : (
              <CheckCircle2 className="size-6 text-green-600" />
            )}
          </AlertDialogMedia>
          <AlertDialogTitle>{labels.confirmSubmission}</AlertDialogTitle>
          <AlertDialogDescription>{labels.confirmSubmissionMessage}</AlertDialogDescription>

          {/* Summary stats */}
          <div className="bg-muted rounded-lg border p-4 text-sm">
            <SummaryRow label={labels.totalQuestions} value={totalQuestions} />
            <SummaryRow label={labels.answered} value={answeredCount} variant="success" />
            <SummaryRow
              label={labels.unanswered}
              value={unansweredCount}
              variant={unansweredCount > 0 ? 'warning' : 'neutral'}
            />
            {flaggedCount > 0 ? (
              <SummaryRow label={labels.flaggedForReview} value={flaggedCount} variant="amber" />
            ) : null}
          </div>

          {/* Unanswered question list with jump links */}
          {unansweredQuestions.length > 0 && onNavigateTo ? (
            <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {labels.unansweredQuestions}
              </p>
              {unansweredQuestions.map(q => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onNavigateTo(q.index)}
                  className="hover:bg-muted/80 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                >
                  <span className="bg-muted-foreground/20 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                    {q.index + 1}
                  </span>
                  <span className="min-w-0 truncate text-xs">
                    {q.question_text || tQuestion('questionNumber', { id: q.index + 1 })}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{labels.reviewQuestions}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onSubmit}
            disabled={isSubmitting}
            className={cn(
              hasWarning
                ? 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500'
                : 'bg-green-600 hover:bg-green-700 focus-visible:ring-green-500',
            )}
          >
            {isSubmitting ? labels.submitting : labels.confirmAndSubmit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type Variant = 'success' | 'warning' | 'amber' | 'neutral'

function SummaryRow({
  label,
  value,
  variant = 'neutral',
}: {
  label: string
  value: number
  variant?: Variant
}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}:</span>
      <span
        className={cn(
          'font-semibold',
          variant === 'success' && 'text-lime-600 dark:text-lime-400',
          variant === 'warning' && value > 0 && 'text-destructive',
          variant === 'amber' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </span>
    </div>
  )
}
