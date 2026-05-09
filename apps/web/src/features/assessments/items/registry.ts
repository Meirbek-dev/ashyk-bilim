import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';

export type ItemKind =
  | 'CHOICE'
  | 'CHOICE_SINGLE'
  | 'CHOICE_MULTIPLE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'OPEN_TEXT'
  | 'FILE_UPLOAD'
  | 'FORM'
  | 'CODE';

export interface ItemAuthorProps<TValue = unknown> {
  value: TValue;
  disabled?: boolean;
  onChange: (nextValue: TValue) => void;
}

export interface ItemAttemptProps<TItem = unknown, TAnswer = unknown> {
  item: TItem;
  answer: TAnswer;
  disabled?: boolean;
  onAnswerChange: (nextAnswer: TAnswer) => void;
}

export interface ItemReviewDetailProps<TItem = unknown, TAnswer = unknown> {
  item?: TItem;
  answer: TAnswer;
}

export interface ItemKindModule<TAuthorValue = any, TAttemptItem = any, TAttemptAnswer = any> {
  kind: ItemKind;
  label: string;
  Author: ComponentType<ItemAuthorProps<TAuthorValue>>;
  Attempt: ComponentType<ItemAttemptProps<TAttemptItem, TAttemptAnswer>>;
  ReviewDetail: ComponentType<ItemReviewDetailProps<TAttemptItem, TAttemptAnswer>>;
}

function getRegistry(): Map<ItemKind, ItemKindModule> {
  const f = getRegistry as any;
  if (!f.map) f.map = new Map<ItemKind, ItemKindModule>();
  return f.map;
}

export function registerItemKind(module: ItemKindModule): void {
  getRegistry().set(module.kind, module);
}

export function getItemKindModule(kind: ItemKind): ItemKindModule {
  const module = getRegistry().get(kind);
  if (!module) {
    throw new Error(`ItemKindRegistry: no module registered for item kind "${kind}"`);
  }
  return module;
}

export function listItemKindModules(): ItemKindModule[] {
  return [...getRegistry().values()];
}

export function UnsupportedItemAuthor({ value }: ItemAuthorProps): ReactNode {
  return createElement(
    'pre',
    { className: 'bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs' },
    JSON.stringify(value, null, 2),
  );
}

export function UnsupportedItemAttempt({ item }: ItemAttemptProps): ReactNode {
  return createElement(
    'div',
    { className: 'text-muted-foreground rounded-md border border-dashed p-4 text-sm' },
    `Unsupported item: ${JSON.stringify(item)}`,
  );
}

export function UnsupportedItemReview({ answer }: ItemReviewDetailProps): ReactNode {
  return createElement(
    'pre',
    { className: 'bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs' },
    JSON.stringify(answer, null, 2),
  );
}

import './choice';
import './file-upload';
import './form';
import './matching';
import './open-text';
import './code';
