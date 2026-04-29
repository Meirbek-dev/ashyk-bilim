'use client';

import { CheckCircle2 } from 'lucide-react';

import type { AssignmentTaskAnswer } from '@/features/assignments/domain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { normalizeQuizAnswer } from '../attempt-utils';
import type { AttemptProps } from '../types';

interface QuizQuestion {
  questionUUID?: string;
  questionText?: string;
  options?: Array<{ optionUUID?: string; text?: string }>;
}

export default function QuizAttempt({ task, answer, disabled, onChange }: AttemptProps) {
  const questions = Array.isArray(task.contents?.questions) ? (task.contents.questions as QuizQuestion[]) : [];
  const normalized = normalizeQuizAnswer(answer);

  const toggleOption = (questionId: string, optionId: string) => {
    const current = normalized.answers[questionId] ?? [];
    const next = current.includes(optionId) ? current.filter((item) => item !== optionId) : [...current, optionId];
    const taskAnswer: AssignmentTaskAnswer = {
      task_uuid: task.assignment_task_uuid,
      content_type: 'quiz',
      quiz_answers: {
        answers: {
          ...normalized.answers,
          [questionId]: next,
        },
      },
    };
    onChange(taskAnswer);
  };

  if (questions.length === 0) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No quiz questions.</div>;
  }

  return (
    <div className="space-y-4">
      {questions.map((question, questionIndex) => {
        const questionId = question.questionUUID ?? `question_${questionIndex}`;
        const selected = normalized.answers[questionId] ?? [];
        return (
          <div
            key={questionId}
            className="rounded-md border bg-muted/30 p-4"
          >
            <div className="mb-3 flex items-start gap-2">
              <Badge variant="secondary">Q{questionIndex + 1}</Badge>
              <p className="font-medium">{question.questionText || 'Question'}</p>
            </div>
            <div className="space-y-2">
              {(question.options ?? []).map((option, optionIndex) => {
                const optionId = option.optionUUID ?? `option_${optionIndex}`;
                const isSelected = selected.includes(optionId);
                return (
                  <Button
                    key={optionId}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                      'h-auto w-full justify-start gap-3 whitespace-normal py-3 text-left',
                      isSelected && 'border-primary bg-primary/10',
                    )}
                    onClick={() => toggleOption(questionId, optionId)}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {String.fromCodePoint(65 + optionIndex)}
                    </span>
                    <span className="flex-1">{option.text || 'Option'}</span>
                    {isSelected ? <CheckCircle2 className="size-4 text-primary" /> : null}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
