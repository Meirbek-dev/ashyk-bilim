'use client'

import { useCallback, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import type { CodeChallengeSubmitControl } from '@/features/code-arena/attempt'
import { CodeSubmissionReview } from '@/features/code-arena/review'
import type { ItemKindModule, ItemReviewDetailProps } from '../registry'
import type { ItemAnswer } from '@/features/assessments/domain/items'
import { UnsupportedItemAttempt, UnsupportedItemAuthor } from '../unsupported'

export interface CodeItemSettings {
  uuid?: string
  time_limit_ms: number
  memory_limit_kb: number
  time_limit: number
  memory_limit: number
  max_submissions?: number
  grading_strategy: string
  allowed_languages: number[]
  visible_tests: {
    id: string
    input: string
    expected_output: string
    description?: string
    is_visible: boolean
    weight?: number
  }[]
  hidden_tests?: {
    id: string
    input: string
    expected_output: string
    description?: string
    is_visible: boolean
    weight?: number
  }[]
  starter_code?: Record<string, string>
}

export interface CodeAttemptItem {
  activityUuid: string
  title?: string
  description?: string
  settings: CodeItemSettings
  initialCode?: string
  initialLanguageId: number
}

export function CodeItemLoading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  )
}

export function useCodeSubmitControl() {
  const [submitControl, setSubmitControl] = useState<CodeChallengeSubmitControl | null>(null)
  const submitRef = useRef<CodeChallengeSubmitControl['submit'] | null>(null)
  const submit = useCallback(() => submitRef.current?.(), [])

  const handleSubmitControlChange = useCallback(
    (control: CodeChallengeSubmitControl | null) => {
      submitRef.current = control?.submit ?? null
      setSubmitControl(prev => {
        if (!prev && !control) return null
        const next = control
          ? {
              canSubmit: control.canSubmit,
              isSubmitting: control.isSubmitting,
              submit,
            }
          : null
        if (prev && next && prev.canSubmit === next.canSubmit && prev.isSubmitting === next.isSubmitting) {
          return prev
        }
        return next
      })
    },
    [submit],
  )

  return { submitControl, handleSubmitControlChange }
}

export function CodeItemReviewDetail({
  item,
  answer,
}: ItemReviewDetailProps<CodeAttemptItem, Extract<ItemAnswer, { kind: 'CODE' }> | null | undefined>) {
  const codeAnswer = answer?.kind === 'CODE' ? answer : null
  const languageId = codeAnswer?.language ?? 0
  const starterTemplate = item?.settings.starter_code?.[String(languageId)] ?? ''
  return <CodeSubmissionReview answer={answer} starterTemplate={starterTemplate} />
}

type CodeItemKindModule = ItemKindModule<
  unknown,
  CodeAttemptItem,
  Extract<ItemAnswer, { kind: 'CODE' }> | null | undefined
>

export const codeModule: CodeItemKindModule = {
  kind: 'CODE',
  label: 'Code',
  Author: UnsupportedItemAuthor,
  // Code items are attempted through the arena (`CodeChallengeAttemptContent`)
  // or inline in `CanonicalItemAttempt`; nothing renders this slot.
  Attempt: UnsupportedItemAttempt as CodeItemKindModule['Attempt'],
  ReviewDetail: CodeItemReviewDetail,
}
