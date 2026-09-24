'use client'

import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items'
import { CanonicalAttemptItem } from '@/features/assessments/shared/canonical-item-rendering'
import { MarkdownContent } from '@/features/content-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { cn } from '@/lib/utils'

interface ExamQuestionCardProps {
  item: AssessmentItem
  questionNumber: number
  answer: ItemAnswer | undefined
  isFlagged?: boolean
  onAnswerChange: (itemId: string, answer: ItemAnswer) => void
  onToggleFlag?: () => void
  /** Read-only once the server stops accepting draft saves (UX-196). */
  disabled?: boolean
}

/**
 * One exam question: header (number, points, flag, prompt) plus the canonical
 * answer control for the item's kind — every kind the server can return
 * (choice, matching, open text, form, code) renders here (BUG-110).
 */
export default function ExamQuestionCard({
  item,
  questionNumber,
  answer,
  isFlagged = false,
  onAnswerChange,
  onToggleFlag,
  disabled = false,
}: ExamQuestionCardProps) {
  const t = useTranslations('Activities.ExamActivity')
  const questionId = item.item_uuid

  return (
    <Card
      role="group"
      aria-labelledby={`question-title-${questionId}`}
      className={cn('rounded-lg shadow-sm', isFlagged && 'ring-2 ring-yellow-400/60 dark:ring-yellow-500/60')}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span id={`question-title-${questionId}`}>{t('questionNumber', { number: questionNumber })}</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-normal">
              {t('points', { count: item.max_score ?? 0 })}
            </span>
            {onToggleFlag ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleFlag}
                aria-label={isFlagged ? t('unflagQuestion') : t('flagQuestion')}
                className={cn(
                  'size-8 transition-colors',
                  isFlagged ? 'text-yellow-600 hover:text-yellow-700' : 'text-muted-foreground hover:text-yellow-600',
                )}
              >
                {isFlagged ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
              </Button>
            ) : null}
          </div>
        </CardTitle>
        <div className="mt-2">
          <MarkdownContent
            content={item.body.prompt}
            mode="prompt"
            className="text-foreground text-base leading-relaxed"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {/* The prompt is in the header; the control renders only the answer. */}
        <CanonicalAttemptItem
          item={{ ...item, body: { ...item.body, prompt: '' } }}
          answer={answer}
          disabled={disabled}
          onChange={next => onAnswerChange(questionId, next)}
        />
      </CardContent>
    </Card>
  )
}
