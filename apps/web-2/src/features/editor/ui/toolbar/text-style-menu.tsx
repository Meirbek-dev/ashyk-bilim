import type { Editor } from '@tiptap/core'
import { Heading } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ChoiceMenu } from '#/shared/ui/choice-menu'
import { IconButton } from '#/shared/ui/icon-button'

const LEVELS = [1, 2, 3] as const

/** Paragraph or heading 1-3 for the block under the cursor. */
export function TextStyleMenu({ editor, level }: { editor: Editor; level: number }) {
  const choose = (value: string) => {
    const next = LEVELS.find(candidate => String(candidate) === value)
    if (next) editor.chain().focus().setHeading({ level: next }).run()
    else editor.chain().focus().setParagraph().run()
  }
  return (
    <ChoiceMenu
      trigger={<IconButton label={m.editor_text_style()} icon={<Heading aria-hidden />} />}
      choice={{
        label: m.editor_text_style(),
        value: String(level),
        options: [
          { value: '0', label: m.editor_paragraph() },
          ...LEVELS.map(candidate => ({ value: String(candidate), label: m.editor_heading({ level: candidate }) })),
        ],
        onValueChange: choose,
      }}
    />
  )
}
