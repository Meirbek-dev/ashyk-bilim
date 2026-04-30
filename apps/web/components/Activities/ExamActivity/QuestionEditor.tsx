// LEGACY — Phase 2 will migrate exam question authoring into features/assessments/registry/exam/.
// TODO Phase 2: delete once exam-author.tsx is fully migrated.
// See plans/assessment-system-redesign.md
'use client';

import { apiFetch } from '@/lib/api-client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { NativeSelect, NativeSelectOption } from '@components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';
import { Textarea } from '@components/ui/textarea';
import { Checkbox } from '@components/ui/checkbox';
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
      const path = isEditing ? `exams/questions/${formData.question_uuid}` : `exams/${examUuid}/questions`;
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

  const addOption = () => {
    // Prevent adding options for TRUE_FALSE - it's a fixed two-option question,
    if (formData.question_type === 'TRUE_FALSE') return;

    setFormData({
      ...formData,
      answer_options: [
        ...formData.answer_options,
        formData.question_type === 'MATCHING' ? { left: '', right: '' } : { text: '', is_correct: false },
      ],
    });
  };

  const removeOption = (index: number) => {
    // Prevent removing options for TRUE_FALSE - options are fixed,
    if (formData.question_type === 'TRUE_FALSE') return;

    setFormData({
      ...formData,
      answer_options: formData.answer_options.filter((_, i) => i !== index),
    });
  };

  const updateOption = (
    index: number,
    updates: Partial<{ text?: string; is_correct?: boolean; left?: string; right?: string }>,
  ) => {
    const newOptions = [...formData.answer_options];
    newOptions[index] = { ...newOptions[index], ...updates };
    setFormData({ ...formData, answer_options: newOptions });
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
          <div className="mt-2 space-y-2">
            {formData.question_type === 'MATCHING' ? (
              formData.answer_options.map((option, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder={t('leftSide')}
                    value={option.left || ''}
                    onChange={(e) => updateOption(index, { left: e.target.value })}
                    className="flex-1"
                  />
                  <span className="pt-2">→</span>
                  <Input
                    placeholder={t('rightSide')}
                    value={option.right || ''}
                    onChange={(e) => updateOption(index, { right: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    disabled={formData.answer_options.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : formData.question_type === 'MULTIPLE_CHOICE' ? (
              formData.answer_options.map((option, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    checked={option.is_correct}
                    onCheckedChange={(checked) => updateOption(index, { is_correct: checked })}
                  />
                  <Input
                    placeholder={t('optionText', { number: index + 1 })}
                    value={option.text}
                    onChange={(e) => updateOption(index, { text: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    disabled={formData.answer_options.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : formData.question_type === 'TRUE_FALSE' ? (
              // TRUE_FALSE: fixed two-option UI (True / False) - no add/remove, no editable labels
              <RadioGroup
                value={(() => {
                  const idx = formData.answer_options.findIndex((o) => o.is_correct);
                  return idx === -1 ? '' : idx.toString();
                })()}
                onValueChange={(value: any) => {
                  const i = Number.parseInt(String(value), 10);
                  const newOptions = [
                    { text: t('true'), is_correct: i === 0 },
                    { text: t('false'), is_correct: i === 1 },
                  ];
                  setFormData({ ...formData, answer_options: newOptions });
                }}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="0"
                    id="option-0"
                  />
                  <Label
                    htmlFor="option-0"
                    className="flex-1 cursor-default select-none"
                  >
                    {t('true')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="1"
                    id="option-1"
                  />
                  <Label
                    htmlFor="option-1"
                    className="flex-1 cursor-default select-none"
                  >
                    {t('false')}
                  </Label>
                </div>
              </RadioGroup>
            ) : (
              // SINGLE_CHOICE - radio with editable labels and add/remove allowed
              <RadioGroup
                value={(() => {
                  const idx = formData.answer_options.findIndex((o) => o.is_correct);
                  return idx === -1 ? '' : idx.toString();
                })()}
                onValueChange={(value: any) => {
                  const i = Number.parseInt(String(value), 10);
                  const newOptions = formData.answer_options.map((opt, idx) => ({
                    ...opt,
                    is_correct: idx === i,
                  }));
                  setFormData({ ...formData, answer_options: newOptions });
                }}
                className="flex flex-col gap-2"
              >
                {formData.answer_options.map((option, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2"
                  >
                    <RadioGroupItem
                      value={index.toString()}
                      id={`option-${index}`}
                    />
                    <Input
                      placeholder={t('optionText', { number: index + 1 })}
                      value={option.text}
                      onChange={(e) => updateOption(index, { text: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOption(index)}
                      disabled={formData.answer_options.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </RadioGroup>
            )}

            {formData.question_type !== 'TRUE_FALSE' && (
              <Button
                variant="outline"
                size="sm"
                onClick={addOption}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('addOption')}
              </Button>
            )}
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
