import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { LanguageInfo } from '#/shared/api/gen/types.gen'
import { Skeleton } from '#/shared/ui/skeleton'

import { languageOf, type CodeAnswer } from '../../model/arena'
import type { EditorPrefs } from '../../model/ide'
import type { EditorKey } from '../editor/extensions'
import { CodeEditor } from '../lazy-editor'

type EditorPaneProps = {
  answer: CodeAnswer
  languages: LanguageInfo[] | null
  prefs: EditorPrefs
  keys: Record<EditorKey, () => void>
  onChange: (next: CodeAnswer) => void
}

/** The workspace's editor: the whole top pane, in the attempt's language, with the learner's settings and keys. */
export function EditorPane({ answer, languages, prefs, keys, onChange }: EditorPaneProps) {
  return (
    <Suspense fallback={<Skeleton className="m-3 h-40" />}>
      <CodeEditor
        fill
        value={answer.source}
        mode={languageOf(languages, answer.language)?.monaco_language ?? 'plaintext'}
        label={m.code_editor_label()}
        prefs={prefs}
        keys={keys}
        onChange={source => onChange({ language: answer.language, source })}
      />
    </Suspense>
  )
}
