import { useId, type FormEvent, type KeyboardEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { Message } from '#/shared/api/gen/types.gen'
import { SubmitButton } from '#/shared/components/submit-button'
import { formatNumber } from '#/shared/i18n/format'
import { Textarea } from '#/shared/ui/textarea'

import { COUNTER_FROM, MAX_BODY } from '../model/feed'
import { AttachButton } from './attach-button'
import { PendingFiles } from './pending-files'
import { SendError } from './send-error'
import { useComposer, type ComposerContext } from './use-composer'

type ComposerProps = {
  to: string
  context?: ComposerContext
  onSent?: (message: Message) => void
}

/** A precise pointer (a mouse): there Enter sends; on a touch screen Enter is a new line and the button sends. */
const enterSends = () => window.matchMedia('(pointer: fine)').matches

/**
 * The message box (docs/DIALOGS.md 9, 12): grows to six lines, Enter sends, Shift+Enter breaks the line; up to five
 * files upload as soon as they are picked, and a message may be files alone. Nothing is inserted before the server
 * answers; a failed send keeps the text and the files, and «Повторить» resends with the same key, so a request that
 * did arrive is not sent twice. A draft (text or files) asks before the page is left.
 */
export function Composer({ to, context, onSent }: ComposerProps) {
  const c = useComposer(to, context, onSent)
  const hintId = useId()
  const errorId = useId()
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    c.submit()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || !enterSends()) return
    event.preventDefault()
    c.submit()
  }
  const left = MAX_BODY - c.text.length
  return (
    <form className="flex flex-col gap-2" onSubmit={onSubmit}>
      <label htmlFor={`${hintId}-box`} className="sr-only">
        {m.conversations_composer_label()}
      </label>
      <Textarea
        id={`${hintId}-box`}
        value={c.text}
        onChange={event => c.edit(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_BODY}
        rows={1}
        aria-describedby={c.send.isError ? `${hintId} ${errorId}` : hintId}
        aria-invalid={c.send.isError || undefined}
        placeholder={m.conversations_composer_label()}
        className="max-h-[calc(6lh+1rem)] min-h-10 resize-none"
      />
      <PendingFiles files={c.files} onRemove={c.removeFile} onRetry={c.retryFile} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <AttachButton count={c.files.length} onFiles={c.addFiles} />
          <p id={hintId} className="text-xs text-muted-foreground">
            {c.text.length >= COUNTER_FROM ? (
              <span aria-live="polite">{m.conversations_chars_left({ count: formatNumber(left) })}</span>
            ) : context?.intervention ? (
              m.conversations_intervention_hint()
            ) : (
              <span className="hidden sm:inline">{m.conversations_composer_hint()}</span>
            )}
          </p>
        </div>
        <SubmitButton type="submit" pending={c.send.isPending} disabled={c.blocker !== null}>
          {c.blocker === 'uploading' ? m.conversations_files_uploading() : m.conversations_send()}
        </SubmitButton>
      </div>
      {c.send.isError ? <SendError id={errorId} error={c.send.error} onRetry={c.submit} /> : null}
    </form>
  )
}
