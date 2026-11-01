import { Maximize2, Minimize2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import type { CodeBody, LanguageInfo } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'

import { starterReset, switchLanguage, type CodeAnswer } from '../../model/arena'
import type { EditorPrefs } from '../../model/ide'
import { LanguageSelect } from '../language-select'
import { ResetStarter } from '../reset-starter'
import type { DraftStatus } from '../use-code-draft'
import { EditorSettings } from './editor-settings'
import { ShortcutsPopover } from './shortcuts-popover'

type IdeToolbarProps = {
  body: CodeBody
  answer: CodeAnswer
  languages: LanguageInfo[] | null
  onAnswer: (next: CodeAnswer) => void
  prefs: EditorPrefs
  onPrefs: (patch: Partial<EditorPrefs>) => void
  expanded: boolean
  onExpand: (expanded: boolean) => void
  /** The attempt's clock (B-COD-05), at the right end before the save state. */
  clock: ReactNode
  saved: DraftStatus
}

const savedText: Record<DraftStatus, () => string> = {
  saved: m.code_saved,
  dirty: m.code_unsaved,
  saving: m.code_saving,
  failed: m.code_save_failed,
  conflict: m.code_save_conflict,
  archived: m.code_save_archived,
  gone: m.code_save_gone,
}

/**
 * Over the editor: the language (a switch carries untouched code over, B-COD-05), back to the starter (B-COD-24);
 * at the right end the clock and save state, the editor settings (B-COD-30), the keys (B-COD-32) and «Развернуть»,
 * which gives the workspace the whole window.
 */
export function IdeToolbar(props: IdeToolbarProps) {
  const { body, answer, languages, onAnswer, prefs, onPrefs, expanded, onExpand, clock, saved } = props
  const reset = starterReset(body, answer)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
      <LanguageSelect
        compact
        label={m.code_language()}
        value={answer.language}
        ids={body.languages ?? []}
        languages={languages}
        onChange={language => onAnswer(switchLanguage(body, answer, language))}
      />
      {reset ? <ResetStarter onReset={() => onAnswer(reset)} /> : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {clock}
        <output className="text-sm text-muted-foreground">{savedText[saved]()}</output>
        <div className="flex items-center">
          <EditorSettings prefs={prefs} onChange={onPrefs} />
          <ShortcutsPopover />
          <IconButton
            label={expanded ? m.code_collapse() : m.code_expand()}
            icon={expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            aria-pressed={expanded}
            onClick={() => onExpand(!expanded)}
          />
        </div>
      </div>
    </div>
  )
}
