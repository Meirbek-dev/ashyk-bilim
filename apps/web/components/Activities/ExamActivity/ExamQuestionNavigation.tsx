'use client';

import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, Flag } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface ExamQuestionNavigationProps {
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: Set<number>;
  flaggedQuestions?: Set<number>;
  onQuestionSelect: (index: number) => void;
  className?: string;
}

export default function ExamQuestionNavigation({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions = new Set(),
  onQuestionSelect,
  className,
}: ExamQuestionNavigationProps) {
  const t = useTranslations('Activities.ExamActivity');

  const answeredCount = answeredQuestions.size;
  const flaggedCount = flaggedQuestions.size;
  const progress = (answeredCount / totalQuestions) * 100;

  return (
    <Card className={cn('overflow-hidden lg:sticky lg:top-6', className)}>
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 px-6 py-4">
        <CardTitle className="text-lg font-bold text-blue-900">{t('questionNavigator')}</CardTitle>
        <CardDescription className="mt-1 text-sm text-blue-700">{t('questionNavigatorDescription')}</CardDescription>
      </div>
      <CardContent className="space-y-5 p-6">
        {/* Progress Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-foreground text-sm font-medium">{t('progress')}</span>
            <span className="text-lg font-bold text-blue-600">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
          <div className="relative">
            <Progress
              value={progress}
              className="h-3"
            />
            <div className="absolute inset-y-0 right-0 left-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-white drop-shadow">{Math.round(progress)}%</span>
            </div>
          </div>
        </div>

        {/* Question Grid */}
        <div className="grid grid-cols-5 gap-2.5 md:grid-cols-8 lg:grid-cols-5">
          {Array.from({ length: totalQuestions }, (_, index) => {
            const questionNumber = index + 1;
            const isAnswered = answeredQuestions.has(index);
            const isCurrent = index === currentQuestionIndex;
            const isFlagged = flaggedQuestions.has(index);

            let bgColor =
              'bg-gradient-to-br from-gray-100 to-gray-50 hover:from-gray-200 hover:to-gray-100 border-border shadow-sm';
            let textColor = 'text-gray-600';
            let borderColor = '';

            if (isCurrent) {
              bgColor =
                'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-blue-600 shadow-md shadow-blue-200';
              textColor = 'text-white';
            } else if (isAnswered) {
              bgColor =
                'bg-gradient-to-br from-green-100 to-green-50 hover:from-green-200 hover:to-green-100 border-green-300 shadow-sm';
              textColor = 'text-green-700';
            }

            if (isFlagged && !isCurrent) {
              borderColor = 'ring-2 ring-orange-400 ring-offset-1';
            }

            return (
              <button
                key={index}
                onClick={() => onQuestionSelect(index)}
                className={cn(
                  'relative inline-flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1',
                  bgColor,
                  textColor,
                  borderColor,
                )}
                aria-label={t('questionAriaLabel', {
                  number: questionNumber,
                  answered: isAnswered ? 'true' : 'false',
                })}
                aria-pressed={isCurrent}
                title={t('questionAriaLabel', {
                  number: questionNumber,
                  answered: isAnswered ? 'true' : 'false',
                })}
              >
                {questionNumber}
                {isFlagged && (
                  <Flag
                    className={cn(
                      'absolute -right-1 -top-1 h-3 w-3',
                      isCurrent ? 'text-orange-300' : 'text-orange-500',
                    )}
                    fill="currentColor"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="border-border space-y-2.5 border-t bg-gradient-to-br from-gray-50 to-white px-4 py-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-100 to-green-50 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-foreground font-medium">
              {t('answered')} <span className="text-green-600">({answeredCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-md shadow-blue-200">
              <Circle className="h-5 w-5 text-white" />
            </div>
            <span className="text-foreground font-medium">{t('current')}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 shadow-sm">
              <Circle className="h-5 w-5 text-gray-400" />
            </div>
            <span className="text-foreground font-medium">
              {t('unanswered')} <span className="text-gray-600">({totalQuestions - answeredCount})</span>
            </span>
          </div>
          {flaggedCount > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-orange-400 bg-orange-50 shadow-sm">
                <Flag
                  className="h-4 w-4 text-orange-600"
                  fill="currentColor"
                />
              </div>
              <span className="text-foreground font-medium">
                {t('flagged')} <span className="text-orange-600">({flaggedCount})</span>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mobile bottom navigation variant
 */
export function ExamQuestionNavigationMobile({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions = new Set(),
  onQuestionSelect,
  onPrevious,
  onNext,
  onSubmit,
  canGoNext,
  canGoPrevious,
}: ExamQuestionNavigationProps & {
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}) {
  const t = useTranslations('Activities.ExamActivity');
  const answeredCount = answeredQuestions.size;
  const progress = (answeredCount / totalQuestions) * 100;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  return (
    <div className="border-border fixed right-0 bottom-0 left-0 z-50 border-t bg-gradient-to-r from-white to-gray-50 shadow-2xl lg:hidden">
      <div className="px-4 py-4">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            <span className="text-foreground">
              {t('questionProgress', {
                current: currentQuestionIndex + 1,
                total: totalQuestions,
              })}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
          <div className="relative">
            <Progress
              value={progress}
              className="h-2"
            />
            <div className="absolute inset-y-0 right-0 left-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-white drop-shadow">{Math.round(progress)}%</span>
            </div>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className="flex-1 font-medium shadow-sm"
            aria-label={t('previous')}
          >
            {t('previous')}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="border-border bg-muted min-w-[70px] border font-bold shadow-sm"
            onClick={() => {
              // Could open a drawer with full question grid
            }}
          >
            <span className="text-sm text-blue-600">
              {currentQuestionIndex + 1}/{totalQuestions}
            </span>
          </Button>

          {isLastQuestion ? (
            <Button
              size="sm"
              onClick={onSubmit}
              className="flex-1 bg-gradient-to-r from-green-600 to-green-700 font-medium shadow-md shadow-green-200 hover:from-green-700 hover:to-green-800"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {t('submitExam')}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onNext}
              disabled={!canGoNext}
              className="flex-1 font-medium shadow-sm"
              aria-label={t('next')}
            >
              {t('next')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
