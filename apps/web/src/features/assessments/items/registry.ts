import type { ComponentType } from 'react'
import { choiceModules } from './choice'
import { codeModule } from './code'
import { formModule } from './form'
import { matchingModule } from './matching'
import { openTextModule } from './open-text'

export type ItemKind =
  | 'CHOICE'
  | 'CHOICE_SINGLE'
  | 'CHOICE_MULTIPLE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'OPEN_TEXT'
  | 'FORM'
  | 'CODE'

export interface ItemAuthorProps<TValue = unknown> {
  value: TValue
  disabled?: boolean
  onChange: (nextValue: TValue) => void
}

export interface ItemAttemptProps<TItem = unknown, TAnswer = unknown> {
  item: TItem
  answer: TAnswer
  disabled?: boolean
  onAnswerChange: (nextAnswer: TAnswer) => void
}

export interface ItemReviewDetailProps<TItem = unknown, TAnswer = unknown> {
  item?: TItem
  answer: TAnswer
}

export interface ItemKindModule<TAuthorValue = any, TAttemptItem = any, TAttemptAnswer = any> {
  kind: ItemKind
  label: string
  Author: ComponentType<ItemAuthorProps<TAuthorValue>>
  Attempt: ComponentType<ItemAttemptProps<TAttemptItem, TAttemptAnswer>>
  ReviewDetail: ComponentType<ItemReviewDetailProps<TAttemptItem, TAttemptAnswer>>
}

function getRegistry(): Map<ItemKind, ItemKindModule> {
  const f = getRegistry as any
  if (!f.map) {
    f.map = new Map<ItemKind, ItemKindModule>()
    for (const m of choiceModules) {
      f.map.set(m.kind, m)
    }
    f.map.set(codeModule.kind, codeModule)
    f.map.set(formModule.kind, formModule)
    f.map.set(matchingModule.kind, matchingModule)
    f.map.set(openTextModule.kind, openTextModule)
  }
  return f.map
}

export function registerItemKind(module: ItemKindModule): void {
  getRegistry().set(module.kind, module)
}

export function getItemKindModule(kind: ItemKind): ItemKindModule {
  const module = getRegistry().get(kind)
  if (!module) {
    throw new Error(`ItemKindRegistry: no module registered for item kind "${kind}"`)
  }
  return module
}

export function listItemKindModules(): ItemKindModule[] {
  return [...getRegistry().values()]
}

export * from './unsupported'
