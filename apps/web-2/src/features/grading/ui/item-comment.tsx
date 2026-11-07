import { MessageSquarePlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

/**
 * A question's comment box, behind one quiet button until it is wanted: most questions get none, and a box under each
 * of thirty questions made a long work look like a form to fill. A comment already written shows its box.
 */
export function ItemComment({ hasText, children }: { hasText: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  if (!open && !hasText)
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ms-3 self-start text-muted-foreground"
        onClick={() => {
          setOpen(true)
          setOpened(true)
        }}
      >
        <MessageSquarePlus aria-hidden data-icon="inline-start" />
        {m.grading_item_feedback_add()}
      </Button>
    )
  return (
    <div
      // Opened by the button: the caret goes straight into the box.
      ref={element => {
        if (opened) element?.querySelector('textarea')?.focus()
      }}
      className="[&_textarea]:field-sizing-content [&_textarea]:min-h-20"
    >
      {children}
    </div>
  )
}
