'use client';

import { Plus, TextCursorInput, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { generateUUID } from '@/lib/utils';

import { registerItemKind } from '../registry';
import type { ItemAuthorProps, ItemAttemptProps, ItemReviewDetailProps } from '../registry';

export interface FormBlank {
  blankUUID: string;
  placeholder: string;
  correctAnswer?: string;
  hint?: string;
}

export interface FormQuestion {
  questionUUID: string;
  questionText: string;
  blanks: FormBlank[];
}

export interface FormItemValue {
  kind: 'FORM';
  questions: FormQuestion[];
}

export interface FormAnswer {
  task_uuid?: string;
  content_type?: 'form';
  form_data?: { answers?: Record<string, string> };
}

function createBlank(): FormBlank {
  return {
    blankUUID: `blank_${generateUUID()}`,
    placeholder: '',
    correctAnswer: '',
    hint: '',
  };
}

function createQuestion(): FormQuestion {
  return {
    questionUUID: `question_${generateUUID()}`,
    questionText: '',
    blanks: [createBlank()],
  };
}

export function normalizeFormItem(raw: Record<string, unknown> | null | undefined): FormItemValue {
  const rawQuestions = Array.isArray(raw?.questions) ? raw.questions : [createQuestion()];
  return {
    kind: 'FORM',
    questions: rawQuestions.map((rawQuestion, questionIndex): FormQuestion => {
      const question = rawQuestion && typeof rawQuestion === 'object' ? (rawQuestion as Record<string, unknown>) : {};
      const rawBlanks = Array.isArray(question.blanks) ? question.blanks : [createBlank()];
      return {
        questionUUID: typeof question.questionUUID === 'string' ? question.questionUUID : `question_${questionIndex}`,
        questionText: typeof question.questionText === 'string' ? question.questionText : '',
        blanks: rawBlanks.map((rawBlank, blankIndex): FormBlank => {
          const blank = rawBlank && typeof rawBlank === 'object' ? (rawBlank as Record<string, unknown>) : {};
          return {
            blankUUID: typeof blank.blankUUID === 'string' ? blank.blankUUID : `blank_${blankIndex}`,
            placeholder: typeof blank.placeholder === 'string' ? blank.placeholder : '',
            correctAnswer: typeof blank.correctAnswer === 'string' ? blank.correctAnswer : '',
            hint: typeof blank.hint === 'string' ? blank.hint : '',
          };
        }),
      };
    }),
  };
}

export function FormItemAuthor({ value, disabled, onChange }: ItemAuthorProps<FormItemValue>) {
  const t = useTranslations('Features.Assessments.Items.Form');

  return (
    <div className="space-y-5">
      <div className="bg-muted/40 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TextCursorInput className="size-4" />
          {t('title')}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>

      {value.questions.map((question, questionIndex) => (
        <div
          key={question.questionUUID}
          className="space-y-3 rounded-md border p-4"
        >
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{t('questionBadge', { number: questionIndex + 1 })}</Badge>
            <Input
              value={question.questionText}
              placeholder={t('questionPlaceholder')}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  questions: value.questions.map((item, index) =>
                    index === questionIndex ? { ...item, questionText: event.target.value } : item,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || value.questions.length <= 1}
              onClick={() =>
                onChange({ ...value, questions: value.questions.filter((_, index) => index !== questionIndex) })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="space-y-2 pl-10">
            {question.blanks.map((blank, blankIndex) => (
              <div
                key={blank.blankUUID}
                className="bg-background grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <Input
                  value={blank.placeholder}
                  placeholder={t('fieldLabelPlaceholder')}
                  disabled={disabled}
                  onChange={(event) =>
                    updateBlank(value, questionIndex, blankIndex, { placeholder: event.target.value }, onChange)
                  }
                />
                <Input
                  value={blank.correctAnswer ?? ''}
                  placeholder={t('correctAnswerPlaceholder')}
                  disabled={disabled}
                  onChange={(event) =>
                    updateBlank(value, questionIndex, blankIndex, { correctAnswer: event.target.value }, onChange)
                  }
                />
                <Input
                  value={blank.hint ?? ''}
                  placeholder={t('hintPlaceholder')}
                  disabled={disabled}
                  onChange={(event) =>
                    updateBlank(value, questionIndex, blankIndex, { hint: event.target.value }, onChange)
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || question.blanks.length <= 1}
                  onClick={() =>
                    onChange({
                      ...value,
                      questions: value.questions.map((item, index) =>
                        index === questionIndex
                          ? {
                              ...item,
                              blanks: item.blanks.filter((_, candidateIndex) => candidateIndex !== blankIndex),
                            }
                          : item,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...value,
                  questions: value.questions.map((item, index) =>
                    index === questionIndex ? { ...item, blanks: [...item.blanks, createBlank()] } : item,
                  ),
                })
              }
            >
              <Plus className="size-4" />
              {t('addBlank')}
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange({ ...value, questions: [...value.questions, createQuestion()] })}
      >
        <Plus className="size-4" />
        {t('addQuestion')}
      </Button>
    </div>
  );
}

function updateBlank(
  value: FormItemValue,
  questionIndex: number,
  blankIndex: number,
  patch: Partial<FormBlank>,
  onChange: (nextValue: FormItemValue) => void,
) {
  onChange({
    ...value,
    questions: value.questions.map((question, index) =>
      index === questionIndex
        ? {
            ...question,
            blanks: question.blanks.map((blank, candidateIndex) =>
              candidateIndex === blankIndex ? { ...blank, ...patch } : blank,
            ),
          }
        : question,
    ),
  });
}

export function FormItemAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<FormItemValue & { taskUuid?: string }, FormAnswer | null>) {
  const t = useTranslations('Features.Assessments.Items.Form');
  const normalized = answer?.form_data?.answers ?? {};
  const updateBlankAnswer = (blankId: string, value: string) => {
    onAnswerChange({
      task_uuid: item.taskUuid,
      content_type: 'form',
      form_data: {
        answers: {
          ...normalized,
          [blankId]: value,
        },
      },
    });
  };

  if (item.questions.length === 0) {
    return <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">{t('noFields')}</div>;
  }

  return (
    <div className="space-y-4">
      {item.questions.map((question, questionIndex) => (
        <div
          key={question.questionUUID}
          className="bg-muted/30 rounded-md border p-4"
        >
          <div className="mb-3 flex items-start gap-2">
            <Badge variant="secondary">{t('questionBadge', { number: questionIndex + 1 })}</Badge>
            <p className="font-medium">{question.questionText || t('promptFallback')}</p>
          </div>
          <div className="grid gap-3">
            {question.blanks.map((blank, blankIndex) => {
              const blankId = blank.blankUUID ?? `blank_${blankIndex}`;
              return (
                <div
                  key={blankId}
                  className="space-y-2"
                >
                  <Label htmlFor={`${item.taskUuid ?? 'form'}-${blankId}`}>
                    {blank.placeholder || t('answerLabel', { number: blankIndex + 1 })}
                  </Label>
                  <Input
                    id={`${item.taskUuid ?? 'form'}-${blankId}`}
                    value={normalized[blankId] ?? ''}
                    disabled={disabled}
                    onChange={(event) => updateBlankAnswer(blankId, event.target.value)}
                  />
                  {blank.hint ? <p className="text-muted-foreground text-xs">{blank.hint}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormItemReviewDetail({ answer }: ItemReviewDetailProps<FormItemValue, FormAnswer | null>) {
  return (
    <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">
      {JSON.stringify(answer?.form_data?.answers ?? {}, null, 2)}
    </pre>
  );
}

registerItemKind({
  kind: 'FORM',
  label: 'Form',
  Author: FormItemAuthor,
  Attempt: FormItemAttempt,
  ReviewDetail: FormItemReviewDetail,
});
