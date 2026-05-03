'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { registerItemKind } from '../registry';
import type { ItemAuthorProps, ItemAttemptProps, ItemReviewDetailProps } from '../registry';
import type { MatchPair } from '../../domain/items';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchingBody {
  kind: 'MATCHING';
  prompt: string;
  pairs: MatchPair[];
}

export interface MatchingAnswer {
  kind: 'MATCHING';
  /** Each entry maps left_id (the `left` string) to a right_id (the `right` string). */
  matches: { left_id: string; right_id: string }[];
}

// ── Author ────────────────────────────────────────────────────────────────────

export function MatchingItemAuthor({ value, disabled, onChange }: ItemAuthorProps<MatchingBody>) {
  const addPair = () => {
    onChange({
      ...value,
      pairs: [...value.pairs, { left: '', right: '' }],
    });
  };

  const updatePair = (index: number, side: 'left' | 'right', text: string) => {
    const updated = value.pairs.map((pair, i) => (i === index ? { ...pair, [side]: text } : pair));
    onChange({ ...value, pairs: updated });
  };

  const removePair = (index: number) => {
    onChange({ ...value, pairs: value.pairs.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">Matching item</div>
        <p className="text-muted-foreground mt-1 text-sm">
          Students drag or select the right-side value that matches each left-side term.
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1">
          <Label className="text-xs font-medium">Left (term)</Label>
          <Label className="text-xs font-medium">Right (match)</Label>
          <span />
        </div>
        {value.pairs.map((pair, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
          >
            <Input
              value={pair.left}
              placeholder={`Term ${index + 1}`}
              disabled={disabled}
              onChange={(e) => updatePair(index, 'left', e.target.value)}
            />
            <Input
              value={pair.right}
              placeholder={`Match ${index + 1}`}
              disabled={disabled}
              onChange={(e) => updatePair(index, 'right', e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => removePair(index)}
              aria-label="Remove pair"
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
          onClick={addPair}
          className="mt-1 gap-1"
        >
          <Plus className="size-3.5" />
          Add pair
        </Button>
      </div>
    </div>
  );
}

// ── Attempt ───────────────────────────────────────────────────────────────────

export function MatchingItemAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<MatchingBody, MatchingAnswer | null>) {
  const currentMatches: Record<string, string> = {};
  if (answer?.matches) {
    for (const m of answer.matches) {
      currentMatches[m.left_id] = m.right_id;
    }
  }

  const updateMatch = (leftId: string, rightId: string) => {
    const existing = answer?.matches?.filter((m) => m.left_id !== leftId) ?? [];
    const next: MatchingAnswer = {
      kind: 'MATCHING',
      matches: rightId ? [...existing, { left_id: leftId, right_id: rightId }] : existing,
    };
    onAnswerChange(next);
  };

  const rightOptions = item.pairs.map((p) => p.right);

  return (
    <div className="space-y-3">
      {item.prompt ? <p className="text-sm">{item.prompt}</p> : null}
      <div className="space-y-2">
        {item.pairs.map((pair, index) => {
          const selected = currentMatches[pair.left] ?? '';
          return (
            <div
              key={index}
              className="bg-background flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
            >
              <span className="min-w-0 flex-1 text-sm font-medium">{pair.left}</span>
              <NativeSelect
                value={selected}
                disabled={disabled}
                onChange={(e) => updateMatch(pair.left, e.target.value)}
                aria-label={`Match for: ${pair.left}`}
                className={cn('sm:max-w-xs', !selected && 'text-muted-foreground')}
              >
                <NativeSelectOption
                  value=""
                  disabled
                  hidden
                >
                  Select match…
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
          );
        })}
      </div>
    </div>
  );
}

// ── Review ────────────────────────────────────────────────────────────────────

export function MatchingItemReview({ item, answer }: ItemReviewDetailProps<MatchingBody, MatchingAnswer | null>) {
  const matchMap: Record<string, string> = {};
  if (answer?.matches) {
    for (const m of answer.matches) {
      matchMap[m.left_id] = m.right_id;
    }
  }

  const correctMap: Record<string, string> = {};
  if (item?.pairs) {
    for (const p of item.pairs) {
      correctMap[p.left] = p.right;
    }
  }

  return (
    <div className="space-y-2">
      {item?.pairs.map((pair, index) => {
        const studentAnswer = matchMap[pair.left];
        const isCorrect = studentAnswer === pair.right;
        return (
          <div
            key={index}
            className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <span className="font-medium">{pair.left}</span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  studentAnswer ? '' : 'text-muted-foreground italic',
                  !isCorrect && studentAnswer && 'text-destructive line-through',
                )}
              >
                {studentAnswer ?? 'No answer'}
              </span>
              {!isCorrect && (
                <Badge
                  variant="outline"
                  className="text-xs"
                >
                  ✓ {pair.right}
                </Badge>
              )}
              {isCorrect && (
                <Badge
                  variant="outline"
                  className="border-green-500 text-xs text-green-600"
                >
                  Correct
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Registration ──────────────────────────────────────────────────────────────

registerItemKind({
  kind: 'MATCHING',
  label: 'Matching',
  Author: MatchingItemAuthor,
  Attempt: MatchingItemAttempt,
  ReviewDetail: MatchingItemReview,
});
