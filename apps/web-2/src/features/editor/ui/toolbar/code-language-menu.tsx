import type { Editor } from '@tiptap/core'
import { FileCode } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ChoiceItems } from '#/shared/components/choice-items'
import { IconButton } from '#/shared/components/icon-button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { CODE_LANGUAGE_NAMES, CODE_LANGUAGES, codeLanguage } from '../../model/code-languages'

const PLAIN = 'plain'

/** The language of the code block under the cursor (B-EDT-25): one of the highlighted ones, or plain text. */
export function CodeLanguageMenu({ editor, language }: { editor: Editor; language: string | null }) {
  const choose = (value: string) =>
    editor
      .chain()
      .focus()
      .updateAttributes('codeBlock', { language: value === PLAIN ? null : value })
      .run()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={m.editor_code_language()} icon={<FileCode aria-hidden />} />} />
      <DropdownMenuContent align="end">
        <ChoiceItems
          choice={{
            label: m.editor_code_language(),
            value: codeLanguage(language) ?? PLAIN,
            options: [
              { value: PLAIN, label: m.editor_code_plain() },
              ...CODE_LANGUAGES.map(value => ({ value, label: CODE_LANGUAGE_NAMES[value] })),
            ],
            onValueChange: choose,
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
