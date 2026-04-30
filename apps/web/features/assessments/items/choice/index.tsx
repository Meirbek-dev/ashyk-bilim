'use client';

import { Check, Plus, Trash2, X } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
              aria-label={`Match ${pair.left}`}
            >
              <NativeSelectOption
                value=""
                disabled
                hidden
              >
                Select match
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
              <span className="text-sm leading-relaxed">{option.text || `Option ${index + 1}`}</span>
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
            <span className="text-sm leading-relaxed">{option.text || `Option ${index + 1}`}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

export function ChoiceItemAuthor({ value, disabled, onChange }: ItemAuthorProps<ChoiceAuthorValue>) {
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
              { id: 0, text: 'True', isCorrect: value.kind !== 'MATCHING' ? value.options[0]?.isCorrect : false },
              { id: 1, text: 'False', isCorrect: value.kind !== 'MATCHING' ? value.options[1]?.isCorrect : false },
            ]
          : value.kind === 'MATCHING'
            ? value.pairs.map((pair) => ({ id: pair.id, text: pair.left, isCorrect: false }))
            : value.options,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-2">
          <Label htmlFor="choice-prompt">Prompt</Label>
          <Input
            id="choice-prompt"
            value={value.prompt}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, prompt: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="choice-kind">Type</Label>
          <NativeSelect
            id="choice-kind"
            value={value.kind}
            disabled={disabled}
            onChange={(event) => setKind(event.target.value as ChoiceItemKind)}
          >
            <NativeSelectOption value="CHOICE_SINGLE">Single choice</NativeSelectOption>
            <NativeSelectOption value="CHOICE_MULTIPLE">Multiple choice</NativeSelectOption>
            <NativeSelectOption value="TRUE_FALSE">True/false</NativeSelectOption>
            <NativeSelectOption value="MATCHING">Matching</NativeSelectOption>
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
  const toggleCorrect = (index: number) => {
    const options = value.options.map((option, candidateIndex) => ({
      ...option,
      isCorrect:
        value.kind === 'CHOICE_MULTIPLE'
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
          className="flex items-center gap-2"
        >
          <Button
            type="button"
            variant={option.isCorrect ? 'default' : 'outline'}
            size="icon"
            disabled={disabled}
            onClick={() => toggleCorrect(index)}
            aria-label="Toggle correct answer"
          >
            {option.isCorrect ? <Check className="size-4" /> : <X className="size-4" />}
          </Button>
          <Input
            value={option.text}
            placeholder={`Option ${String.fromCodePoint(65 + index)}`}
            disabled={disabled || value.kind === 'TRUE_FALSE'}
            onChange={(event) =>
              onChange({
                ...value,
                options: value.options.map((candidate, candidateIndex) =>
                  candidateIndex === index ? { ...candidate, text: event.target.value } : candidate,
                ),
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || value.kind === 'TRUE_FALSE' || value.options.length <= 1}
            onClick={() =>
              onChange({ ...value, options: value.options.filter((_, candidateIndex) => candidateIndex !== index) })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {value.kind !== 'TRUE_FALSE' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...value,
              options: [...value.options, { id: `option_${crypto.randomUUID()}`, text: '', isCorrect: false }],
            })
          }
        >
          <Plus className="size-4" />
          Add option
        </Button>
      ) : null}
    </div>
  );
}

function MatchingAuthor({
  value,
  disabled,
  onChange,
}: ItemAuthorProps<Extract<ChoiceAuthorValue, { kind: 'MATCHING' }>>) {
  return (
    <div className="space-y-2">
      {value.pairs.map((pair, index) => (
        <div
          key={String(pair.id)}
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Input
            value={pair.left}
            placeholder="Left"
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
            placeholder="Right"
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
        Add pair
      </Button>
    </div>
  );
}

export function ChoiceItemReviewDetail({ item, answer }: ItemReviewDetailProps<ChoiceAttemptItem, ChoiceAnswer>) {
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
        {typeof item.points === 'number' ? <Badge variant="secondary">{item.points} pts</Badge> : null}
      </div>
      <p className="text-sm font-medium">{item.prompt}</p>
      <pre className={cn('mt-2 whitespace-pre-wrap text-sm', item.kind !== 'MATCHING' && 'font-sans')}>
        {answerLabel}
      </pre>
    </div>
  );
}

for (const kind of ['CHOICE_SINGLE', 'CHOICE_MULTIPLE', 'TRUE_FALSE', 'MATCHING'] as const) {
  registerItemKind({
    kind,
    label: kind.replaceAll('_', ' ').toLowerCase(),
    Author: ChoiceItemAuthor,
    Attempt: ChoiceItemAttempt,
    ReviewDetail: ChoiceItemReviewDetail,
  });
}
