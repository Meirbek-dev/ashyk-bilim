'use client';

import { cn } from '@/lib/utils';

interface ExamQuestionNavigationProps {
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: Set<number>;
  onQuestionSelect: (index: number) => void;
}

interface ExamQuestionNavigationMobileProps extends ExamQuestionNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
}

export default function ExamQuestionNavigation({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  onQuestionSelect,
}: ExamQuestionNavigationProps) {
  return (
    <div className="bg-card sticky top-4 rounded-lg border p-4">
      <div className="text-muted-foreground mb-3 text-sm font-medium">Questions</div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: totalQuestions }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onQuestionSelect(i)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded text-xs font-medium transition-colors',
              i === currentQuestionIndex
                ? 'bg-primary text-primary-foreground'
                : answeredQuestions.has(i)
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExamQuestionNavigationMobile({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
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
              i === currentQuestionIndex
                ? 'bg-primary text-primary-foreground'
                : answeredQuestions.has(i)
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground',
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
