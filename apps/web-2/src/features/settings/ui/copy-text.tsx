import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

type CopyTextProps = {
  /** What the block is (its accessible name). */
  label: string
  text: string
  /** The button's verb with its object («Копировать токен»). */
  copyLabel: string
  /** A multi-line snippet keeps its lines; a single value stays on one line and scrolls. */
  multiline?: boolean
}

/** A value to paste somewhere else, shown as code with a copy button; selectable by hand when the clipboard refuses. */
export function CopyText({ label, text, copyLabel, multiline = false }: CopyTextProps) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <pre
        aria-label={label}
        className={
          multiline
            ? 'overflow-x-auto rounded-md border bg-muted p-3 font-mono text-sm'
            : 'overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm whitespace-nowrap'
        }
      >
        {text}
      </pre>
      <div>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
          {copied ? m.settings_tokens_copied() : copyLabel}
        </Button>
      </div>
    </div>
  )
}
