'use client'

import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

const EMPTY_SET = new Set<number>()

interface ExamQuestionNavigationProps {
  totalQuestions: number
  currentQuestionIndex: number
  answeredQuestions: Set<number>
  flaggedQuestions?: Set<number>
  onQuestionSelect: (index: number) => void
}

function getButtonStyle(i: number, currentIndex: number, answered: Set<number>, flagged: Set<number>): string {
  if (i === currentIndex) return 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30'
  if (flagged.has(i) && answered.has(i))
    return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-400 dark:bg-yellow-900/40 dark:text-yellow-200'
  if (flagged.has(i))
    return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-300'
  if (answered.has(i)) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  return 'bg-muted text-muted-foreground hover:bg-muted/80'
}

export default function ExamQuestionNavigation({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions = EMPTY_SET,
  onQuestionSelect,
}: ExamQuestionNavigationProps) {
  const t = useTranslations('Features.Assessments.Exam')
  const answeredCount = answeredQuestions.size

  return (
    <div className="bg-card sticky top-4 rounded-lg border p-4">
      <div className="mb-1 text-sm font-medium">{t('questions')}</div>
      <div className="text-muted-foreground mb-3 text-xs">
        {t('answeredOf', { answered: answeredCount, total: totalQuestions })}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: totalQuestions }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onQuestionSelect(i)}
            aria-current={i === currentQuestionIndex ? 'step' : undefined}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded text-xs font-medium transition-colors',
              getButtonStyle(i, currentQuestionIndex, answeredQuestions, flaggedQuestions),
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {/* Legend */}
      <div className="mt-3 space-y-1">
        <LegendItem color="bg-green-100 dark:bg-green-900/30" label={t('legendAnswered')} />
        <LegendItem color="bg-yellow-50 ring-1 ring-yellow-300 dark:bg-yellow-900/20" label={t('legendFlagged')} />
        <LegendItem color="bg-muted" label={t('legendNotAnswered')} />
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('size-3 rounded-sm', color)} />
      <span className="text-muted-foreground text-[11px]">{label}</span>
    </div>
  )
}

/**
 * Below `lg` the sidebar grid is hidden: a scrollable number strip under the
 * questions. Previous/Next live in the fixed action bar only.
 */
export function ExamQuestionNavigationMobile({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions = EMPTY_SET,
  onQuestionSelect,
}: ExamQuestionNavigationProps) {
  const t = useTranslations('Features.Assessments.Exam')

  return (
    <nav aria-label={t('questions')} className="bg-card flex gap-1 overflow-x-auto rounded-lg border p-2 lg:hidden">
      {Array.from({ length: totalQuestions }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onQuestionSelect(i)}
          aria-current={i === currentQuestionIndex ? 'step' : undefined}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded text-xs font-medium',
            getButtonStyle(i, currentQuestionIndex, answeredQuestions, flaggedQuestions),
          )}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  )
}
