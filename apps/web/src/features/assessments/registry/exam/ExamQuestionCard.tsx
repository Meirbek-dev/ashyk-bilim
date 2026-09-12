'use client'

import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ChoiceItemAttempt } from '@/features/assessments/items/choice'
import type { ChoiceAnswer, ChoiceAttemptItem } from '@/features/assessments/items/choice'
import { MatchingItemAttempt } from '@/features/assessments/items/matching'
import type { MatchingAnswer, MatchingBody } from '@/features/assessments/items/matching'
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

function getAnswerOptionId(option: QuestionData['answer_options'][number], visualIndex: number): string | number {
  return typeof option.option_id === 'string' || typeof option.option_id === 'number' ? option.option_id : visualIndex
}

// The learner's matching item: rows are the left column, options the right
// one (server order); ids equal texts on the learner read. The exam keeps the
// answer as `{ left: right }`, the item module as `{ matches }`.
function toMatchingBody(question: QuestionData): MatchingBody {
  const option = (text: string) => ({ id: text, text })
  return {
    kind: 'MATCHING',
    prompt: '',
    pairs: [],
    left: question.answer_options.map(o => option(o.left ?? '')),
    right: question.answer_options.map(o => option(o.right ?? '')),
  }
}

function toMatchingAnswer(answer: unknown): MatchingAnswer | null {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null
  return {
    kind: 'MATCHING',
    matches: Object.entries(answer as Record<string, string>)
      .filter(([, right]) => typeof right === 'string' && right.length > 0)
      .map(([left, right]) => ({ left, right })),
  }
}

function toChoiceItem(question: QuestionData): ChoiceAttemptItem {
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
    options: question.answer_options.map((option, index) =>
      option.is_correct === undefined
        ? {
            id: getAnswerOptionId(option, index),
            text: option.text,
          }
        : {
            id: getAnswerOptionId(option, index),
            text: option.text,
            isCorrect: option.is_correct,
          },
    ),
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
      className={cn('rounded-lg shadow-sm', isFlagged && 'ring-2 ring-yellow-400/60 dark:ring-yellow-500/60')}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span id={`question-title-${questionId}`}>{t('questionNumber', { number: questionNumber })}</span>
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
            content={question.question_text}
            mode="prompt"
            className="text-foreground text-base leading-relaxed"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {question.question_type === 'MATCHING' ? (
          <MatchingItemAttempt
            item={toMatchingBody(question)}
            answer={toMatchingAnswer(answer[questionId])}
            onAnswerChange={next =>
              onAnswerChange(questionId, Object.fromEntries((next?.matches ?? []).map(m => [m.left, m.right])))
            }
          />
        ) : (
          <ChoiceItemAttempt
            item={toChoiceItem(question)}
            answer={answer[questionId] as ChoiceAnswer}
            onAnswerChange={nextAnswer => onAnswerChange(questionId, nextAnswer)}
          />
        )}
      </CardContent>
    </Card>
  )
}
