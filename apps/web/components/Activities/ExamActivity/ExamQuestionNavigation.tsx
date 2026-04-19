'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, Flag, LayoutGrid } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface ExamQuestionNavigationProps {
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: Set<number>;
  flaggedQuestions?: Set<number>;
  onQuestionSelect: (index: number) => void;
  className?: string;
}

function getQuestionButtonClassName(isCurrent: boolean, isAnswered: boolean, isFlagged: boolean) {
  return cn(
    'relative inline-flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2',
    isCurrent
      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
      : isAnswered
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'border-border bg-background text-muted-foreground hover:bg-muted',
    isFlagged && !isCurrent && 'ring-1 ring-amber-400 ring-offset-2',
  );
}

function QuestionGrid({
  totalQuestions,
  currentQuestionIndex,
  answeredQuestions,
  flaggedQuestions,
  onQuestionSelect,
  t,
  compact = false,
}: ExamQuestionNavigationProps & {
  t: ReturnType<typeof useTranslations<'Activities.ExamActivity'>>;
  compact?: boolean;
}) {
  return (
    <div className={cn('grid', compact ? 'grid-cols-4 gap-2 sm:grid-cols-5' : 'grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-5')}>
      {Array.from({ length: totalQuestions }, (_, index) => {
        const questionNumber = index + 1;
        const isAnswered = answeredQuestions.has(index);
        const isCurrent = index === currentQuestionIndex;
        const isFlagged = flaggedQuestions?.has(index) ?? false;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onQuestionSelect(index)}
            className={getQuestionButtonClassName(isCurrent, isAnswered, isFlagged)}
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
            {isFlagged ? (
              <Flag
                className={cn('absolute -right-1 -top-1 h-3 w-3', isCurrent ? 'text-amber-200' : 'text-amber-500')}
                fill="currentColor"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
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
    <Card className={cn('overflow-hidden border-border/80 shadow-sm lg:sticky lg:top-6', className)}>
      <div className="border-border bg-muted/30 border-b px-6 py-4">
        <CardTitle className="text-lg font-bold">{t('questionNavigator')}</CardTitle>
        <CardDescription className="mt-1 text-sm">{t('questionNavigatorDescription')}</CardDescription>
      </div>
      <CardContent className="space-y-5 p-6">
        {/* Progress Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-foreground text-sm font-medium">{t('progress')}</span>
            <span className="text-lg font-bold text-primary">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
          <Progress
            value={progress}
            className="h-2.5"
          />
          <p className="text-muted-foreground text-xs font-medium">{Math.round(progress)}%</p>
        </div>

        {/* Question Grid */}
        <QuestionGrid
          totalQuestions={totalQuestions}
          currentQuestionIndex={currentQuestionIndex}
          answeredQuestions={answeredQuestions}
          flaggedQuestions={flaggedQuestions}
          onQuestionSelect={onQuestionSelect}
          t={t}
        />

        {/* Legend */}
        <div className="border-border bg-muted/20 space-y-2.5 border-t px-4 py-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-foreground font-medium">
              {t('answered')} <span className="text-green-600">({answeredCount})</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Circle className="h-5 w-5 text-white" />
            </div>
            <span className="text-foreground font-medium">{t('current')}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background shadow-sm">
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const answeredCount = answeredQuestions.size;
  const progress = (answeredCount / totalQuestions) * 100;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  return (
    <>
      <div className="border-border/80 bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {/* Progress bar */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-foreground">
                {t('questionProgress', {
                  current: currentQuestionIndex + 1,
                  total: totalQuestions,
                })}
              </span>
              <span className="bg-muted text-foreground rounded-full px-2.5 py-1 text-xs font-semibold">
                {answeredCount}/{totalQuestions}
              </span>
            </div>
            <Progress
              value={progress}
              className="h-2"
            />
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
              variant="outline"
              size="sm"
              className="min-w-[84px] border-dashed font-semibold shadow-sm"
              onClick={() => {
                setIsPickerOpen(true);
              }}
              aria-label={t('questionNavigator')}
            >
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              <span>{currentQuestionIndex + 1}</span>
            </Button>

            {isLastQuestion ? (
              <Button
                size="sm"
                onClick={onSubmit}
                className="flex-1 bg-emerald-600 font-medium shadow-sm hover:bg-emerald-700"
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t('reviewAndSubmit')}
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

      <Sheet
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
      >
        <SheetContent
          side="bottom"
          className="max-h-[75vh] rounded-t-3xl border-t p-0"
        >
          <SheetHeader className="border-border bg-background border-b px-4 pt-3 pb-4">
            <div className="bg-muted mx-auto mb-3 h-1.5 w-12 rounded-full" />
            <SheetTitle>{t('questionNavigator')}</SheetTitle>
            <SheetDescription>{t('questionNavigatorDescription')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="bg-muted/30 rounded-2xl border p-4">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>{t('progress')}</span>
                <span>{answeredCount}/{totalQuestions}</span>
              </div>
              <Progress
                value={progress}
                className="h-2"
              />
            </div>
            <QuestionGrid
              totalQuestions={totalQuestions}
              currentQuestionIndex={currentQuestionIndex}
              answeredQuestions={answeredQuestions}
              flaggedQuestions={flaggedQuestions}
              onQuestionSelect={(index) => {
                onQuestionSelect(index);
                setIsPickerOpen(false);
              }}
              t={t}
              compact
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
