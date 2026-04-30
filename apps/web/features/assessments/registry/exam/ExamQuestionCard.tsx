'use client';

import { useTranslations } from 'next-intl';

import { ChoiceItemAttempt } from '@/features/assessments/items/choice';
import type { ChoiceAnswer, ChoiceAttemptItem } from '@/features/assessments/items/choice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';

interface QuestionData {
  id: number;
  question_uuid: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: { text: string; is_correct?: boolean; left?: string; right?: string; option_id?: number }[];
}

interface ExamQuestionCardProps {
  question: QuestionData;
  questionNumber: number;
  answer: Record<number, unknown>;
  onAnswerChange: (questionId: number, answer: unknown) => void;
}

function getAnswerOptionId(option: QuestionData['answer_options'][number], visualIndex: number): number {
  return typeof option.option_id === 'number' ? option.option_id : visualIndex;
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
    };
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
  };
}

export default function ExamQuestionCard({ question, questionNumber, answer, onAnswerChange }: ExamQuestionCardProps) {
  const t = useTranslations('Activities.ExamActivity');
  const questionId = question.id;

  return (
    <Card
      role="group"
      aria-labelledby={`question-title-${questionId}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span id={`question-title-${questionId}`}>{t('questionNumber', { number: questionNumber })}</span>
          <span className="text-muted-foreground text-sm font-normal">
            {t('points', { count: question.points ?? 0 })}
          </span>
        </CardTitle>
        <CardDescription className="text-foreground mt-4 text-xl leading-relaxed">
          {question.question_text}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <ChoiceItemAttempt
          item={toChoiceItem(question)}
          answer={answer[questionId] as ChoiceAnswer}
          onAnswerChange={(nextAnswer) => onAnswerChange(questionId, nextAnswer)}
        />
      </CardContent>
    </Card>
  );
}
