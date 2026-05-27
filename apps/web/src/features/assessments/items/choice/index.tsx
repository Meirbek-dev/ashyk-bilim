'use client';

import { Check, Circle, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MarkdownContent, MarkdownEditor } from '@/features/content-markdown';

import { registerItemKind } from '../registry';
import type { ItemAuthorProps, ItemAttemptProps, ItemReviewDetailProps } from '../registry';

export type ChoiceItemKind = 'CHOICE_SINGLE' | 'CHOICE_MULTIPLE' | 'TRUE_FALSE' | 'MATCHING';

export interface ChoiceOption {
  id: string | number;
  text: string;
  isCorrect?: boolean;
}

export interface MatchingPair {
  id: string | number;
  left: string;
  right: string;
}

export type ChoiceAuthorValue =
  | {
      kind: 'CHOICE_SINGLE' | 'CHOICE_MULTIPLE' | 'TRUE_FALSE';
      prompt: string;
      points?: number;
      options: ChoiceOption[];
    }
  | {
      kind: 'MATCHING';
      prompt: string;
      points?: number;
      pairs: MatchingPair[];
    };

export type ChoiceAttemptItem =
  | {
      id: string | number;
      kind: 'CHOICE_SINGLE' | 'CHOICE_MULTIPLE' | 'TRUE_FALSE';
      prompt: string;
      points?: number;
      options: ChoiceOption[];
    }
  | {
      id: string | number;
      kind: 'MATCHING';
      prompt: string;
      points?: number;
      pairs: MatchingPair[];
    };

export type ChoiceAnswer = string | number | (string | number)[] | Record<string, string> | null | undefined;

function optionId(option: ChoiceOption, index: number) {
  return option.id ?? index;
}

export function ChoiceItemAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<ChoiceAttemptItem, ChoiceAnswer>) {
  const t = useTranslations('Features.Assessments.Items.Choice');

  if (item.kind === 'MATCHING') {
    const current = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
    const rightOptions = item.pairs.map((pair) => pair.right);

    return (
      <div className="space-y-3">
        {item.pairs.map((pair) => (
          <div
            key={pair.id}
            className="bg-background flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 text-sm font-medium">{pair.left}</span>
            <NativeSelect
              value={current[pair.left] ?? ''}
              disabled={disabled}
              onChange={(event) => onAnswerChange({ ...current, [pair.left]: event.target.value })}
              aria-label={t('matching.matchLabel', { term: pair.left })}
            >
              <NativeSelectOption
                value=""
                disabled
                hidden
              >
                {t('selectMatch')}
              </NativeSelectOption>
              {rightOptions.map((right) => (
                <NativeSelectOption
                  key={right}
                  value={right}
                >
                  {right}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>
    );
  }

  if (item.kind === 'CHOICE_MULTIPLE') {
    const selected = Array.isArray(answer) ? answer : [];
    return (
      <div className="space-y-2">
        {item.options.map((option, index) => {
          const id = optionId(option, index);
          return (
            <label
              key={String(id)}
              className="bg-background hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors"
            >
              <Checkbox
                checked={selected.includes(id)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = checked ? [...selected, id] : selected.filter((itemId) => itemId !== id);
                  onAnswerChange(next);
                }}
              />
              <div className="min-w-0 flex-1 text-sm leading-relaxed">
                <MarkdownContent
                  mode="compactRichText"
                  compact
                  content={option.text || `Option ${index + 1}`}
                />
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  const current = answer === null || answer === undefined ? '' : String(answer);
  return (
    <RadioGroup
      value={current}
      onValueChange={(value) => onAnswerChange(Number.isNaN(Number(value)) ? value : Number(value))}
      className="space-y-2"
      disabled={disabled}
    >
      {item.options.map((option, index) => {
        const id = optionId(option, index);
        return (
          <label
            key={String(id)}
            className="bg-background hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors"
          >
            <RadioGroupItem value={String(id)} />
            <div className="min-w-0 flex-1 text-sm leading-relaxed">
              <MarkdownContent
                mode="compactRichText"
                compact
                content={option.text || `Option ${index + 1}`}
              />
            </div>
          </label>
        );
      })}
    </RadioGroup>
  );
}

export function ChoiceItemAuthor({ value, disabled, onChange }: ItemAuthorProps<ChoiceAuthorValue>) {
  const t = useTranslations('Features.Assessments.Items.Choice');

  const setKind = (kind: ChoiceItemKind) => {
    if (kind === 'MATCHING') {
      onChange({
        kind,
        prompt: value.prompt,
        points: value.points,
        pairs:
          value.kind === 'MATCHING'
            ? value.pairs
            : value.options.map((option, index) => ({
                id: option.id ?? index,
                left: option.text,
                right: '',
              })),
      });
      return;
    }

    onChange({
      kind,
      prompt: value.prompt,
      points: value.points,
      options:
        kind === 'TRUE_FALSE'
          ? [
              {
                id: 0,
                text: t('trueLabel'),
                isCorrect: value.kind !== 'MATCHING' ? value.options[0]?.isCorrect : false,
              },
              {
                id: 1,
                text: t('falseLabel'),
                isCorrect: value.kind !== 'MATCHING' ? value.options[1]?.isCorrect : false,
              },
            ]
          : value.kind === 'MATCHING'
            ? value.pairs.map((pair) => ({ id: pair.id, text: pair.left, isCorrect: false }))
            : value.options,
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-2">
          <Label>{t('prompt')}</Label>
          <MarkdownEditor
            value={value.prompt}
            disabled={disabled}
            placeholder={t('promptPlaceholder')}
            preset="questionPrompt"
            onChange={(md) => onChange({ ...value, prompt: md })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="choice-kind">{t('type')}</Label>
          <NativeSelect
            id="choice-kind"
            value={value.kind}
            disabled={disabled}
            onChange={(event) => setKind(event.target.value as ChoiceItemKind)}
          >
            <NativeSelectOption value="CHOICE_SINGLE">{t('kinds.single')}</NativeSelectOption>
            <NativeSelectOption value="CHOICE_MULTIPLE">{t('kinds.multiple')}</NativeSelectOption>
            <NativeSelectOption value="TRUE_FALSE">{t('kinds.trueFalse')}</NativeSelectOption>
            <NativeSelectOption value="MATCHING">{t('kinds.matching')}</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      {value.kind === 'MATCHING' ? (
        <MatchingAuthor
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <OptionsAuthor
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function OptionsAuthor({
  value,
  disabled,
  onChange,
}: ItemAuthorProps<Extract<ChoiceAuthorValue, { options: ChoiceOption[] }>>) {
  const t = useTranslations('Features.Assessments.Items.Choice');
  const isMultiple = value.kind === 'CHOICE_MULTIPLE';
  const isTrueFalse = value.kind === 'TRUE_FALSE';

  const toggleCorrect = (index: number) => {
    const options = value.options.map((option, candidateIndex) => ({
      ...option,
      isCorrect: isMultiple
        ? candidateIndex === index
          ? !option.isCorrect
          : option.isCorrect
        : candidateIndex === index,
    }));
    onChange({ ...value, options });
  };

  return (
    <div className="space-y-2">
      {value.options.map((option, index) => (
        <div
          key={String(option.id)}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all duration-200',
            option.isCorrect
              ? 'border-emerald-400 bg-emerald-50/60 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/20'
              : 'border-border bg-card hover:border-border/80 hover:bg-muted/30',
          )}
        >
          {/* Correct toggle button */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => toggleCorrect(index)}
            aria-label={t('toggleCorrectAnswer')}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
              option.isCorrect
                ? 'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600'
                : 'border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-600',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {option.isCorrect ? (
              <Check className="size-3.5" />
            ) : isMultiple ? (
              <span className="size-2 rounded-sm border border-current" />
            ) : (
              <Circle className="size-3" />
            )}
          </button>

          {/* Option letter */}
          <span
            className={cn(
              'w-5 shrink-0 text-center text-sm font-semibold',
              option.isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground',
            )}
          >
            {String.fromCodePoint(65 + index)}
          </span>

          {/* Option text input */}
          <input
            value={option.text}
            placeholder={t('optionPlaceholder', { label: String.fromCodePoint(65 + index) })}
            disabled={disabled || isTrueFalse}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60',
              disabled && 'cursor-not-allowed',
            )}
            onChange={(event) =>
              onChange({
                ...value,
                options: value.options.map((candidate, candidateIndex) =>
                  candidateIndex === index ? { ...candidate, text: event.target.value } : candidate,
                ),
              })
            }
          />

          {/* Correct badge */}
          {option.isCorrect ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {t('correctLabel')}
            </span>
          ) : null}

          {/* Delete button */}
          {!isTrueFalse ? (
            <button
              type="button"
              disabled={disabled || value.options.length <= 1}
              onClick={() => onChange({ ...value, options: value.options.filter((_, i) => i !== index) })}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
              aria-label={t('removeOption')}
            >
              <Trash2 className="text-muted-foreground hover:text-destructive size-4 transition-colors" />
            </button>
          ) : null}
        </div>
      ))}

      {!isTrueFalse ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...value,
              options: [...value.options, { id: `option_${crypto.randomUUID()}`, text: '', isCorrect: false }],
            })
          }
          className={cn(
            'flex w-full items-center gap-2 rounded-xl border-2 border-dashed p-3.5 text-sm text-muted-foreground transition-colors',
            'hover:border-border hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <Plus className="size-4 shrink-0" />
          {t('addOption')}
        </button>
      ) : null}
    </div>
  );
}

function MatchingAuthor({
  value,
  disabled,
  onChange,
}: ItemAuthorProps<Extract<ChoiceAuthorValue, { kind: 'MATCHING' }>>) {
  const t = useTranslations('Features.Assessments.Items.Choice');
  return (
    <div className="space-y-2">
      {value.pairs.map((pair, index) => (
        <div
          key={String(pair.id)}
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Input
            value={pair.left}
            placeholder={t('matching.left')}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                pairs: value.pairs.map((candidate, candidateIndex) =>
                  candidateIndex === index ? { ...candidate, left: event.target.value } : candidate,
                ),
              })
            }
          />
          <Input
            value={pair.right}
            placeholder={t('matching.right')}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                pairs: value.pairs.map((candidate, candidateIndex) =>
                  candidateIndex === index ? { ...candidate, right: event.target.value } : candidate,
                ),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || value.pairs.length <= 1}
            onClick={() =>
              onChange({ ...value, pairs: value.pairs.filter((_, candidateIndex) => candidateIndex !== index) })
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
            pairs: [...value.pairs, { id: `pair_${crypto.randomUUID()}`, left: '', right: '' }],
          })
        }
      >
        <Plus className="size-4" />
        {t('matching.addPair')}
      </Button>
    </div>
  );
}

export function ChoiceItemReviewDetail({ item, answer }: ItemReviewDetailProps<ChoiceAttemptItem, ChoiceAnswer>) {
  const t = useTranslations('Features.Assessments.Items.Choice');

  if (!item) {
    return <pre className="bg-muted rounded-md p-3 text-xs">{JSON.stringify(answer, null, 2)}</pre>;
  }

  const answerLabel = (() => {
    if (item.kind === 'MATCHING') return JSON.stringify(answer ?? {}, null, 2);
    if (item.kind === 'CHOICE_MULTIPLE') {
      const ids = Array.isArray(answer) ? answer : [];
      return item.options
        .filter((option, index) => ids.includes(optionId(option, index)))
        .map((option) => option.text)
        .join(', ');
    }
    return (
      item.options.find((option, index) => String(optionId(option, index)) === String(answer))?.text ??
      String(answer ?? '-')
    );
  })();

  return (
    <div className="bg-card rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline">{item.kind.replaceAll('_', ' ')}</Badge>
        {typeof item.points === 'number' ? (
          <Badge variant="secondary">{t('points', { count: item.points })}</Badge>
        ) : null}
      </div>
      <MarkdownContent
        mode="compactRichText"
        content={item.prompt}
        compact
      />
      <pre className={cn('mt-2 whitespace-pre-wrap text-sm', item.kind !== 'MATCHING' && 'font-sans')}>
        {answerLabel}
      </pre>
    </div>
  );
}

for (const kind of ['CHOICE', 'CHOICE_SINGLE', 'CHOICE_MULTIPLE', 'TRUE_FALSE', 'MATCHING'] as const) {
  registerItemKind({
    kind,
    label: kind.replaceAll('_', ' ').toLowerCase(),
    Author: ChoiceItemAuthor,
    Attempt: ChoiceItemAttempt,
    ReviewDetail: ChoiceItemReviewDetail,
  });
}
