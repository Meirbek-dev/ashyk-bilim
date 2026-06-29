'use client'

import { AlertCircle, CheckCircle2, Flag } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
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

const EMPTY_UNANSWERED: UnansweredQuestion[] = []

export default function ExamSubmitDialog({
  open,
  totalQuestions,
  answeredCount,
  flaggedCount = 0,
  unansweredQuestions = EMPTY_UNANSWERED,
  isSubmitting,
  labels,
  onCancel,
  onSubmit,
  onNavigateTo,
}: ExamSubmitDialogProps) {
  const tQuestion = useTranslations('Features.Assessments.Shared.PostSubmissionFeedback')
  const unansweredCount = totalQuestions - answeredCount
  const hasWarning = unansweredCount > 0 || flaggedCount > 0
  const completion = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0
  const statusLabel = hasWarning ? labels.reviewQuestions : labels.confirmAndSubmit

  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !nextOpen && onCancel()}>
      <AlertDialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-xl gap-0 overflow-hidden p-0">
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5">
          <AlertDialogHeader className="grid-cols-[auto_1fr] grid-rows-[auto_auto] place-items-start gap-x-3 gap-y-1 text-start sm:grid-rows-[auto_auto]">
            <AlertDialogMedia
              className={cn(
                'mb-0 row-span-2',
                hasWarning ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
              )}
            >
              {hasWarning ? <AlertCircle /> : <CheckCircle2 />}
            </AlertDialogMedia>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AlertDialogTitle className="col-start-auto">{labels.confirmSubmission}</AlertDialogTitle>
              <Badge variant={hasWarning ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
            </div>
            <AlertDialogDescription className="col-start-2">{labels.confirmSubmissionMessage}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="bg-muted/35 flex flex-col gap-3 rounded-lg border p-4">
            <Progress value={completion} aria-label={labels.answered} className="gap-2">
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-sm font-medium">{labels.answered}</span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {answeredCount}/{totalQuestions}
                </span>
              </div>
            </Progress>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SummaryMetric label={labels.totalQuestions} value={totalQuestions} />
              <SummaryMetric label={labels.answered} value={answeredCount} tone="positive" />
              <SummaryMetric
                label={labels.unanswered}
                value={unansweredCount}
                tone={unansweredCount > 0 ? 'risk' : 'muted'}
              />
            </div>

            {flaggedCount > 0 ? (
              <>
                <Separator />
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Flag className="text-current" />
                  <span className="min-w-0">
                    {labels.flaggedForReview}: <span className="text-foreground font-medium">{flaggedCount}</span>
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {unansweredQuestions.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{labels.unansweredQuestions}</p>
                <Badge variant="outline">{unansweredCount}</Badge>
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border">
                {unansweredQuestions.map(q => {
                  const questionLabel = q.question_text || tQuestion('questionNumber', { id: q.index + 1 })
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onNavigateTo?.(q.index)}
                      disabled={!onNavigateTo || isSubmitting}
                      className="hover:bg-muted/70 focus-visible:bg-muted flex w-full items-center gap-3 border-b px-3 py-2.5 text-left text-sm transition-colors outline-none last:border-b-0 disabled:pointer-events-none disabled:opacity-60"
                    >
                      <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums">
                        {q.index + 1}
                      </span>
                      <span className="min-w-0 truncate">{questionLabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <AlertDialogFooter className="mx-0 mb-0 grid grid-cols-1 rounded-none sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] [&_[data-slot=button]]:w-full [&_[data-slot=button]]:min-w-0 [&_[data-slot=button]]:whitespace-normal">
          <AlertDialogCancel disabled={isSubmitting} variant="ghost">
            {labels.reviewQuestions}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Spinner data-icon="inline-start" className="text-current" />
            ) : (
              hasWarning && <AlertCircle data-icon="inline-start" />
            )}
            {isSubmitting ? labels.submitting : labels.confirmAndSubmit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type SummaryTone = 'positive' | 'risk' | 'muted'

function SummaryMetric({ label, value, tone = 'muted' }: { label: string; value: number; tone?: SummaryTone }) {
  return (
    <div className="bg-background/80 ring-border/70 flex min-w-0 flex-col gap-1 rounded-md p-3 ring-1">
      <span
        className={cn(
          'text-xl font-semibold leading-none tabular-nums',
          tone === 'positive' && 'text-primary',
          tone === 'risk' && 'text-destructive',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-xs">{label}</span>
    </div>
  )
}
