'use client'

import { AlignLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Textarea } from '@/components/ui/textarea'
import { MarkdownContent, MarkdownEditor } from '@/features/content-markdown'
import type { ItemAttemptProps, ItemAuthorProps, ItemKindModule, ItemReviewDetailProps } from '../registry'

export interface OpenTextValue {
  kind: 'OPEN_TEXT' | 'OTHER'
  body: {
    prompt: string
  }
}

export interface OpenTextAnswer {
  task_uuid?: string
  content_type?: 'text'
  text?: string
}

export function normalizeOpenText(raw: Record<string, unknown> | null | undefined): OpenTextValue {
  const body = raw?.body && typeof raw.body === 'object' ? (raw.body as Record<string, unknown>) : {}
  return {
    kind: 'OPEN_TEXT',
    body: {
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
    },
  }
}

export function OpenTextAuthor({ value, disabled, onChange }: ItemAuthorProps<OpenTextValue>) {
  const t = useTranslations('Features.Assessments.Items.OpenText')

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlignLeft className="size-4" />
          {t('title')}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>
      <MarkdownEditor
        value={value.body.prompt}
        placeholder={t('promptPlaceholder')}
        preset="questionPrompt"
        onChange={prompt => onChange({ ...value, body: { prompt } })}
        {...(disabled !== undefined ? { disabled } : {})}
      />
    </div>
  )
}

export function OpenTextAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<OpenTextValue & { taskUuid?: string }, OpenTextAnswer | null>) {
  return (
    <div className="space-y-3">
      {item.body.prompt ? <MarkdownContent content={item.body.prompt} mode="prompt" /> : null}
      <Textarea
        value={answer?.text ?? ''}
        disabled={disabled}
        className="min-h-36"
        onChange={event =>
          onAnswerChange({
            content_type: 'text',
            text: event.target.value,
            ...(item.taskUuid ? { task_uuid: item.taskUuid } : {}),
          })
        }
      />
    </div>
  )
}

export function OpenTextReviewDetail({ answer }: ItemReviewDetailProps<OpenTextValue, OpenTextAnswer | null>) {
  const t = useTranslations('Features.Assessments.Items.OpenText')

  return (
    <p className="bg-card rounded-md border p-3 text-sm whitespace-pre-wrap">{answer?.text ?? t('noTextRecorded')}</p>
  )
}

export const openTextModule: ItemKindModule = {
  kind: 'OPEN_TEXT',
  label: 'Open text',
  Author: OpenTextAuthor,
  Attempt: OpenTextAttempt,
  ReviewDetail: OpenTextReviewDetail,
}
