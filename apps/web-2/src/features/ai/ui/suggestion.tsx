import { ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '#/shared/ui/button'

type SuggestionProps = { children: ReactNode; disabled?: boolean; onClick: () => void }

/** A question offered ready to ask (a starter, a follow-up): the whole line sends it. */
export function Suggestion({ children, disabled, onClick }: SuggestionProps) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      className="h-auto! min-h-control w-full justify-between gap-3 py-2 text-left font-normal whitespace-normal"
      onClick={onClick}
    >
      <span className="min-w-0 text-pretty">{children}</span>
      <ArrowUp aria-hidden className="shrink-0 text-muted-foreground" />
    </Button>
  )
}
