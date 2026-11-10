import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { Message } from '#/shared/api/gen/types.gen'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatNumber } from '#/shared/i18n/format'
import { Textarea } from '#/shared/ui/textarea'

import { COUNTER_FROM, MAX_BODY } from '../model/feed'
import { sendOptions } from '../queries'
import { SendError } from './send-error'
import { useDraft } from './use-draft'

type ComposerProps = {
  to: string
  /** What the first message is about (where the writer started from). */
  context?: { course?: string | undefined; activity?: string | undefined }
  onSent?: (message: Message) => void
}

const newKey = () => crypto.randomUUID()

/** A precise pointer (a mouse): there Enter sends; on a touch screen Enter is a new line and the button sends. */
const enterSends = () => window.matchMedia('(pointer: fine)').matches

/**
 * The message box (docs/DIALOGS.md 9): grows to six lines, Enter sends, Shift+Enter breaks the line. Nothing is
 * inserted before the server answers; a failed send keeps the text and «Повторить» resends with the same key, so a
 * request that did arrive is not sent twice. A typed draft asks before the page is left.
 */
export function Composer({ to, context, onSent }: ComposerProps) {
  const [clientKey, setClientKey] = useState(newKey)
  const send = useMutation(sendOptions(useQueryClient()))
  const { text, edit } = useDraft(send.isPending)
  const hintId = useId()
  const errorId = useId()
  const empty = text.trim() === ''
  const submit = () => {
    if (empty || send.isPending || text.length > MAX_BODY) return
    send.mutate(
      {
        body: {
          to_user_id: to,
          body: text,
          client_key: clientKey,
          ...(context?.course ? { course_id: context.course } : {}),
          ...(context?.activity ? { activity_id: context.activity } : {}),
        },
      },
      {
        onSuccess: message => {
          edit('')
          setClientKey(newKey())
          onSent?.(message)
        },
      },
    )
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !enterSends()) return
    event.preventDefault()
    submit()
  }
  const left = MAX_BODY - text.length
  return (
    <form className="flex flex-col gap-2" onSubmit={onSubmit}>
      <label htmlFor={`${hintId}-box`} className="sr-only">
        {m.conversations_composer_label()}
      </label>
      <Textarea
        id={`${hintId}-box`}
        value={text}
        onChange={event => {
          edit(event.target.value)
          // The key belongs to the text that failed: a changed text is a new message.
          if (send.isError) {
            send.reset()
            setClientKey(newKey())
          }
        }}
        onKeyDown={onKeyDown}
        maxLength={MAX_BODY}
        rows={1}
        aria-describedby={send.isError ? `${hintId} ${errorId}` : hintId}
        aria-invalid={send.isError || undefined}
        placeholder={m.conversations_composer_label()}
        className="max-h-[calc(6lh+1rem)] min-h-10 resize-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-xs text-muted-foreground">
          {text.length >= COUNTER_FROM ? (
            <span aria-live="polite">{m.conversations_chars_left({ count: formatNumber(left) })}</span>
          ) : (
            <span className="hidden sm:inline">{m.conversations_composer_hint()}</span>
          )}
        </p>
        <SubmitButton type="submit" pending={send.isPending} disabled={empty}>
          {m.conversations_send()}
        </SubmitButton>
      </div>
      {send.isError ? <SendError id={errorId} error={send.error} onRetry={submit} /> : null}
    </form>
  )
}
