'use client';

import { apiFetch } from '@/lib/api-client';

import { ChoiceItemAuthor } from '@/features/assessments/items/choice';
import type { ChoiceAuthorValue } from '@/features/assessments/items/choice';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { NativeSelect, NativeSelectOption } from '@components/ui/native-select';
import { Textarea } from '@components/ui/textarea';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';

interface Question {
  id?: number;
  question_uuid?: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: { text?: string; is_correct?: boolean; left?: string; right?: string; option_id?: number }[];
  order_index: number;
}

interface QuestionEditorProps {
  question: Question | null;
  examUuid: string;
  onSave: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
}

export default function QuestionEditor({ question, examUuid, onSave, onCancel, autoFocus }: QuestionEditorProps) {
  const t = useTranslations('Components.QuestionManagement');
  const [formData, setFormData] = useState<Question>(
    question ?? {
      question_text: '',
      question_type: 'SINGLE_CHOICE',
      points: 1,
      explanation: '',
      answer_options: [{ text: '', is_correct: false }],
      order_index: 0,
    },
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (autoFocus) {
      const el = document.getElementById('question-text') as HTMLTextAreaElement | null;
      if (el) el.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    // If parent supplies a different question (e.g., opening for edit/new), update form,
    setFormData(
      question ?? {
        question_text: '',
        question_type: 'SINGLE_CHOICE',
        points: 1,
        explanation: '',
        answer_options: [{ text: '', is_correct: false }],
        order_index: 0,
      },
    );
  }, [question]);

  const handleSave = async () => {
    if (!formData.question_text.trim()) {
      toast.error(t('questionTextRequired'));
      return;
    }

    if (formData.answer_options.length === 0) {
      toast.error(t('atLeastOneOption'));
      return;
    }

    // Validate that at least one answer is marked as correct,
    if (formData.question_type !== 'MATCHING') {
      const hasCorrectAnswer = formData.answer_options.some((opt) => opt.is_correct);
      if (!hasCorrectAnswer) {
        toast.error(t('atLeastOneCorrectAnswer'));
        return;
      }
    }

    setIsSaving(true);

    try {
      const isEditing = Boolean(formData.question_uuid);
      const path = isEditing
        ? `assessments/${examUuid}/exam/questions/${formData.question_uuid}`
        : `assessments/${examUuid}/exam/questions`;
      const response = await apiFetch(path, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_text: formData.question_text,
          question_type: formData.question_type,
          points: formData.points,
          explanation: formData.explanation,
          answer_options: formData.answer_options,
          order_index: formData.order_index,
        }),
      });

      if (!response.ok) throw new Error('Failed to save question');

      toast.success(isEditing ? t('questionUpdated') : t('questionCreated'));
      onSave();
    } catch (error) {
      console.error('Error saving question:', error);
      toast.error(t('errorSavingQuestion'));
    } finally {
      setIsSaving(false);
    }
  };

  // When switching question types, normalize options:
  // - TRUE_FALSE: ensure two options, labeled True/False, and at most one marked correct
  // - SINGLE_CHOICE: ensure at most one marked correct,
  useEffect(() => {
    setFormData((prev) => {
      if (prev.question_type === 'TRUE_FALSE') {
        const opts = [...prev.answer_options];
        // ensure at least two options,
        if (opts.length < 2) {
          return {
            ...prev,
            answer_options: [
              { text: t('true'), is_correct: opts[0]?.is_correct ?? false },
              { text: t('false'), is_correct: opts[1]?.is_correct ?? false },
            ],
          };
        }

        // ensure texts are present,
        const normalized = opts
          .slice(0, 2)
          .map((o, i) => Object.assign(o, { text: o.text || (i === 0 ? t(`true`) : t(`false`)) }));
        const firstCorrect = normalized.findIndex((o) => o.is_correct);
        if (firstCorrect === -1) {
          return { ...prev, answer_options: normalized };
        }
        return {
          ...prev,
          answer_options: normalized.map((o, i) => Object.assign(o, { is_correct: i === firstCorrect })),
        };
      }

      if (prev.question_type === 'SINGLE_CHOICE') {
        const firstCorrect = prev.answer_options.findIndex((o) => o.is_correct);
        if (firstCorrect === -1) return prev;
        return {
          ...prev,
          answer_options: prev.answer_options.map((o, i) => ({
            ...o,
            is_correct: i === firstCorrect,
          })),
        };
      }

      return prev;
    });
  }, [formData.question_type, t]);

  const questionTypes = [
    { value: 'SINGLE_CHOICE', label: t('single_choice') },
    { value: 'MULTIPLE_CHOICE', label: t('multiple_choice') },
    { value: 'TRUE_FALSE', label: t('true_false') },
    { value: 'MATCHING', label: t('matching') },
  ];

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-medium">{formData.question_uuid ? t('editQuestion') : t('addNewQuestion')}</h3>
        <p className="text-sm text-gray-500">{t('fillInQuestionDetails')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="question-text">{t('questionText')}</Label>
          <Textarea
            id="question-text"
            value={formData.question_text}
            onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
            placeholder={t('questionTextPlaceholder')}
            rows={3}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="question-type">{t('questionType')}</Label>
            <NativeSelect
              value={formData.question_type}
              onChange={(event) =>
                setFormData({ ...formData, question_type: event.target.value as Question['question_type'] })
              }
              className="w-full"
              aria-label={t('questionType')}
            >
              {questionTypes.map((item) => (
                <NativeSelectOption
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="points">{t('pointsLabel')}</Label>
            <Input
              id="points"
              type="number"
              min="1"
              max="100"
              value={formData.points}
              onChange={(e) => setFormData({ ...formData, points: Number.parseInt(e.target.value) })}
              className="w-18"
            />
          </div>
        </div>

        <div>
          <Label>{t('answerOptions')}</Label>
          <div className="mt-2">
            <ChoiceItemAuthor
              value={questionToChoiceAuthorValue(formData)}
              onChange={(nextValue) => setFormData(choiceAuthorValueToQuestion(formData, nextValue, t))}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="explanation">
            {t('explanation')} {t('optional')}
          </Label>
          <Textarea
            id="explanation"
            value={formData.explanation || ''}
            onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
            placeholder={t('explanationPlaceholder')}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function questionToChoiceAuthorValue(question: Question): ChoiceAuthorValue {
  if (question.question_type === 'MATCHING') {
    return {
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
    kind:
      question.question_type === 'SINGLE_CHOICE'
        ? 'CHOICE_SINGLE'
        : question.question_type === 'MULTIPLE_CHOICE'
          ? 'CHOICE_MULTIPLE'
          : 'TRUE_FALSE',
    prompt: question.question_text,
    points: question.points,
    options: question.answer_options.map((option, index) => ({
      id: option.option_id ?? index,
      text: option.text ?? '',
      isCorrect: option.is_correct === true,
    })),
  };
}

function choiceAuthorValueToQuestion(
  question: Question,
  value: ChoiceAuthorValue,
  t: ReturnType<typeof useTranslations<'Components.QuestionManagement'>>,
): Question {
  if (value.kind === 'MATCHING') {
    return {
      ...question,
      question_text: value.prompt,
      question_type: 'MATCHING',
      answer_options: value.pairs.map((pair) => ({ left: pair.left, right: pair.right })),
    };
  }

  const questionType =
    value.kind === 'CHOICE_SINGLE'
      ? 'SINGLE_CHOICE'
      : value.kind === 'CHOICE_MULTIPLE'
        ? 'MULTIPLE_CHOICE'
        : 'TRUE_FALSE';

  return {
    ...question,
    question_text: value.prompt,
    question_type: questionType,
    answer_options:
      value.kind === 'TRUE_FALSE'
        ? [
            { text: t('true'), is_correct: value.options[0]?.isCorrect === true },
            { text: t('false'), is_correct: value.options[1]?.isCorrect === true },
          ]
        : value.options.map((option) => ({ text: option.text, is_correct: option.isCorrect === true })),
  };
}
