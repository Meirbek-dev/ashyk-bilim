import type { Editor } from '@tiptap/core'
import { ChevronDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ChoiceItems } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

const LEVELS = [1, 2, 3, 4, 5, 6] as const

const styleName = (level: number) => (level === 0 ? m.editor_paragraph() : m.editor_heading({ level }))

/**
 * Paragraph or heading 1-6 (as the old editor offered) for the block under the cursor. The button reads the current
 * style in words, like a word processor, so the writer sees what the line is without opening the menu.
 */
export function TextStyleMenu({ editor, level }: { editor: Editor; level: number }) {
  const choose = (value: string) => {
    const next = LEVELS.find(candidate => String(candidate) === value)
    if (next) editor.chain().focus().setHeading({ level: next }).run()
    else editor.chain().focus().setParagraph().run()
  }
  const current = styleName(level)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={m.editor_text_style_current({ style: current })}
            className="min-w-36 justify-between"
          />
        }
      >
        {current}
        <ChevronDown aria-hidden data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <ChoiceItems
          choice={{
            label: m.editor_text_style(),
            value: String(level),
            options: [
              { value: '0', label: m.editor_paragraph() },
              ...LEVELS.map(candidate => ({ value: String(candidate), label: styleName(candidate) })),
            ],
            onValueChange: choose,
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
