'use client'

import { useCallback, useRef, useState } from 'react'

import { CodeChallengeEditor } from '@/components/features/courses/code-challenges'
import type { CodeChallengeSubmitControl } from '@/components/features/courses/code-challenges'
import { Skeleton } from '@/components/ui/skeleton'
import { CodeSubmissionReview } from '@/features/code-arena/review'
import type { ItemAttemptProps, ItemKindModule, ItemReviewDetailProps } from '../registry'
import type { ItemAnswer } from '@/features/assessments/domain/items'
import { UnsupportedItemAuthor } from '../unsupported'

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
  onSubmitControlChange?: (control: CodeChallengeSubmitControl | null) => void
  onSubmit?: () => Promise<void> | void
}

export function CodeItemAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<CodeAttemptItem, Extract<ItemAnswer, { kind: 'CODE' }> | undefined>) {
  const initialCode = answer?.source ?? item.initialCode

  return (
    <div className="bg-card h-full overflow-hidden">
      <CodeChallengeEditor
        activityUuid={item.activityUuid}
        settings={item.settings}
        initialLanguageId={answer?.language ?? item.initialLanguageId}
        {...(initialCode === undefined ? {} : { initialCode })}
        {...(answer === undefined ? {} : { answer })}
        {...(onAnswerChange === undefined ? {} : { onAnswerChange })}
        {...(item.onSubmit === undefined ? {} : { onSubmit: item.onSubmit })}
        {...(disabled === undefined ? {} : { disabled })}
        {...(item.title === undefined ? {} : { challengeTitle: item.title })}
        {...(item.description === undefined ? {} : { challengeDescription: item.description })}
        hideHeader
        {...(disabled === undefined ? {} : { hideSubmitButton: disabled })}
        {...(item.onSubmitControlChange === undefined ? {} : { onSubmitControlChange: item.onSubmitControlChange })}
      />
    </div>
  )
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
}: ItemReviewDetailProps<CodeAttemptItem, ItemAnswer | null | undefined>) {
  const codeAnswer = answer?.kind === 'CODE' ? answer : null
  const languageId = codeAnswer?.language ?? 0
  const starterTemplate = item?.settings.starter_code?.[String(languageId)] ?? ''
  return <CodeSubmissionReview answer={answer} starterTemplate={starterTemplate} />
}

export const codeModule: ItemKindModule = {
  kind: 'CODE',
  label: 'Code',
  Author: UnsupportedItemAuthor,
  Attempt: CodeItemAttempt,
  ReviewDetail: CodeItemReviewDetail,
}
