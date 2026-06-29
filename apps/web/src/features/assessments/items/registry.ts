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

export interface ItemKindModule<TAuthorValue = unknown, TAttemptItem = unknown, TAttemptAnswer = unknown> {
  kind: ItemKind
  label: string
  Author: ComponentType<ItemAuthorProps<TAuthorValue>>
  Attempt: ComponentType<ItemAttemptProps<TAttemptItem, TAttemptAnswer>>
  ReviewDetail: ComponentType<ItemReviewDetailProps<TAttemptItem, TAttemptAnswer>>
}

const registryMap = new Map<ItemKind, ItemKindModule>()
let registryInitialized = false

function getRegistry(): Map<ItemKind, ItemKindModule> {
  if (!registryInitialized) {
    for (const m of choiceModules) {
      registryMap.set(m.kind, m)
    }
    registryMap.set(codeModule.kind, codeModule as ItemKindModule)
    registryMap.set(formModule.kind, formModule as ItemKindModule)
    registryMap.set(matchingModule.kind, matchingModule as ItemKindModule)
    registryMap.set(openTextModule.kind, openTextModule as ItemKindModule)
    registryInitialized = true
  }
  return registryMap
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
