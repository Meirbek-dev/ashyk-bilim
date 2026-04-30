'use client';

import { AlignLeft } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';
import { registerItemKind, type ItemAuthorProps, type ItemAttemptProps, type ItemReviewDetailProps } from '../registry';

export interface OpenTextValue {
  kind: 'OPEN_TEXT' | 'OTHER';
  body: {
    prompt: string;
  };
}

export interface OpenTextAnswer {
  task_uuid?: string;
  content_type?: 'text';
  text?: string;
}

export function normalizeOpenText(raw: Record<string, unknown> | null | undefined): OpenTextValue {
  const body = raw?.body && typeof raw.body === 'object' ? (raw.body as Record<string, unknown>) : {};
  return {
    kind: 'OPEN_TEXT',
    body: {
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
    },
  };
}

export function OpenTextAuthor({ value, disabled, onChange }: ItemAuthorProps<OpenTextValue>) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlignLeft className="size-4" />
          Open text item
        </div>
        <p className="text-muted-foreground mt-1 text-sm">Prompt for a manually graded written response.</p>
      </div>
      <Textarea
        value={value.body.prompt}
        placeholder="Prompt"
        disabled={disabled}
        className="min-h-36"
        onChange={(event) => onChange({ ...value, body: { prompt: event.target.value } })}
      />
    </div>
  );
}

export function OpenTextAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<OpenTextValue & { taskUuid?: string }, OpenTextAnswer | null>) {
  return (
    <div className="space-y-3">
      {item.body.prompt ? <p className="text-sm">{item.body.prompt}</p> : null}
      <Textarea
        value={answer?.text ?? ''}
        disabled={disabled}
        className="min-h-36"
        onChange={(event) =>
          onAnswerChange({
            task_uuid: item.taskUuid,
            content_type: 'text',
            text: event.target.value,
          })
        }
      />
    </div>
  );
}

export function OpenTextReviewDetail({ answer }: ItemReviewDetailProps<OpenTextValue, OpenTextAnswer | null>) {
  return <p className="whitespace-pre-wrap rounded-md border bg-card p-3 text-sm">{answer?.text ?? 'No text recorded'}</p>;
}

registerItemKind({
  kind: 'OPEN_TEXT',
  label: 'Open text',
  Author: OpenTextAuthor,
  Attempt: OpenTextAttempt,
  ReviewDetail: OpenTextReviewDetail,
});
