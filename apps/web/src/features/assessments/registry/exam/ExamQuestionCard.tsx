'use client'

import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ChoiceItemAttempt } from '@/features/assessments/items/choice'
import type { ChoiceAnswer, ChoiceAttemptItem } from '@/features/assessments/items/choice'
import { MarkdownContent } from '@/features/content-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { cn } from '@/lib/utils'

interface QuestionData {
  id: string
  question_uuid: string
  question_text: string
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING'
  points: number
  explanation?: string
  answer_options: {
    text: string
    is_correct?: boolean
    left?: string
    right?: string
    option_id?: string | number
  }[]
}

interface ExamQuestionCardProps {
  question: QuestionData
  questionNumber: number
  answer: Record<string, unknown>
  isFlagged?: boolean
  onAnswerChange: (questionId: string, answer: unknown) => void
  onToggleFlag?: () => void
}

function getAnswerOptionId(
  option: QuestionData['answer_options'][number],
  visualIndex: number,
): string | number {
  return typeof option.option_id === 'string' || typeof option.option_id === 'number'
    ? option.option_id
    : visualIndex
}

function toChoiceItem(question: QuestionData): ChoiceAttemptItem {
  if (question.question_type === 'MATCHING') {
    return {
      id: question.id,
      kind: 'MATCHING',
      prompt: question.question_text,
      points: question.points,
      pairs: question.answer_options.map((option, index) => ({
        id: option.option_id ?? index,
        left: option.left ?? '',
        right: option.right ?? '',
      })),
    }
  }

  return {
    id: question.id,
    kind:
      question.question_type === 'SINGLE_CHOICE'
        ? 'CHOICE_SINGLE'
        : question.question_type === 'MULTIPLE_CHOICE'
          ? 'CHOICE_MULTIPLE'
          : 'TRUE_FALSE',
    prompt: question.question_text,
    points: question.points,
    options: question.answer_options.map((option, index) => ({
      id: getAnswerOptionId(option, index),
      text: option.text,
      isCorrect: option.is_correct,
    })),
  }
}

export default function ExamQuestionCard({
  question,
  questionNumber,
  answer,
  isFlagged = false,
  onAnswerChange,
  onToggleFlag,
}: ExamQuestionCardProps) {
  const t = useTranslations('Activities.ExamActivity')
  const questionId = question.id

  return (
    <Card
      role="group"
      aria-labelledby={`question-title-${questionId}`}
      className={cn(isFlagged && 'ring-2 ring-amber-400/60 dark:ring-amber-500/60')}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span id={`question-title-${questionId}`}>
            {t('questionNumber', { number: questionNumber })}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm font-normal">
              {t('points', { count: question.points ?? 0 })}
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
                  isFlagged
                    ? 'text-amber-500 hover:text-amber-600'
                    : 'text-muted-foreground hover:text-amber-500',
                )}
              >
                {isFlagged ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
              </Button>
            ) : null}
          </div>
        </CardTitle>
        <div className="mt-2">
          <MarkdownContent
            content={question.question_text}
            mode="prompt"
            className="text-foreground text-base leading-relaxed"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <ChoiceItemAttempt
          item={toChoiceItem(question)}
          answer={answer[questionId] as ChoiceAnswer}
          onAnswerChange={nextAnswer => onAnswerChange(questionId, nextAnswer)}
        />
      </CardContent>
    </Card>
  )
}
