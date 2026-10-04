import { useState, type ReactNode } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { RemediationQuestion } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

type PracticeItemProps = {
  item: RemediationQuestion
  /** Reports the reveal (the remediation session counts them). */
  onReveal?: () => void
  /** Shown under a revealed answer (the remediation's "I got it right"). */
  children?: ReactNode
}

/** One practice question: the prompt, its choices, "Show answer" -> the answer and its explanation. */
export function PracticeItem({ item, onReveal, children }: PracticeItemProps) {
  const [revealed, setRevealed] = useState(false)
  return (
    <li className="flex flex-col gap-2 border-b pb-4 last:border-b-0">
      <MarkdownView content={item.prompt} />
      {item.choices && item.choices.length > 0 ? (
        <ul className="list-disc ps-5 text-sm">
          {item.choices.map(choice => (
            <li key={choice}>{choice}</li>
          ))}
        </ul>
      ) : null}
      {revealed ? (
        <div className="flex flex-col gap-2 text-sm">
          {item.answer ? <MarkdownView content={item.answer} /> : null}
          {item.explanation ? <MarkdownView content={item.explanation} /> : null}
          {children}
        </div>
      ) : (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRevealed(true)
              onReveal?.()
            }}
          >
            {m.ai_show_answer()}
          </Button>
        </div>
      )}
    </li>
  )
}
