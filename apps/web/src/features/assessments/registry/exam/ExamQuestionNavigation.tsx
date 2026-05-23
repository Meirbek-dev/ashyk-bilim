'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface ExamQuestionNavigationProps {
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: Set<number>;
  flaggedQuestions?: Set<number>;
  onQuestionSelect: (index: number) => void;
}

interface ExamQuestionNavigationMobileProps extends ExamQuestionNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
}

function getButtonStyle(
  i: number,
  currentIndex: number,
  answered: Set<number>,
  flagged: Set<number>,
): string {
  if (i === currentIndex)
    return 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30';
  if (flagged.has(i) && answered.has(i))
    return 'bg-amber-100 text-amber-800 ring-1 ring-amber-400 dark:bg-amber-900/40 dark:text-amber-200';
  if (flagged.has(i))
    return 'bg-amber-50 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:text-amber-300';
  if (answered.has(i))
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  return 'bg-muted text-muted-foreground hover:bg-muted/80';
}

export default function ExamQuestionNavigation({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions = new Set(),
  onQuestionSelect,
}: ExamQuestionNavigationProps) {
  const t = useTranslations('Features.Assessments.Exam');
  const answeredCount = answeredQuestions.size;

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
            title={`Q${i + 1}${flaggedQuestions.has(i) ? ' 🔖' : ''}`}
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
        <LegendItem color="bg-emerald-100 dark:bg-emerald-900/30" label={t('legendAnswered')} />
        <LegendItem color="bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20" label={t('legendFlagged')} />
        <LegendItem color="bg-muted" label={t('legendNotAnswered')} />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('size-3 rounded-sm', color)} />
      <span className="text-muted-foreground text-[11px]">{label}</span>
    </div>
  );
}

export function ExamQuestionNavigationMobile({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions = new Set(),
  onQuestionSelect,
  onPrevious,
  onNext,
}: ExamQuestionNavigationMobileProps) {
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <button
        type="button"
        onClick={onPrevious}
        disabled={currentQuestionIndex === 0}
        className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        ←
      </button>
      <div className="flex flex-1 gap-1 overflow-x-auto">
        {Array.from({ length: totalQuestions }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onQuestionSelect(i)}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-medium',
              getButtonStyle(i, currentQuestionIndex, answeredQuestions, flaggedQuestions),
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={currentQuestionIndex === totalQuestions - 1}
        className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        →
      </button>
    </div>
  );
}
