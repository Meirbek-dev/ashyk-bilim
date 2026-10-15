import { m } from '#/paraglide/messages'
import type { CodeBody, LanguageInfo } from '#/shared/api/gen/types.gen'

import { type CodeAnswer, starterReset, switchLanguage } from '../model/arena'
import { LanguageSelect } from './language-select'
import { ResetStarter } from './reset-starter'

type LanguageBarProps = {
  body: CodeBody
  answer: CodeAnswer
  languages: LanguageInfo[] | null
  onChange: (next: CodeAnswer) => void
}

/** The attempt's language (a switch carries untouched code over, B-COD-05) and "back to the starter" (B-COD-24). */
export function LanguageBar({ body, answer, languages, onChange }: LanguageBarProps) {
  const reset = starterReset(body, answer)
  return (
    <div className="flex flex-wrap items-end gap-2">
      <LanguageSelect
        label={m.code_language()}
        value={answer.language}
        ids={body.languages ?? []}
        languages={languages}
        onChange={language => onChange(switchLanguage(body, answer, language))}
      />
      {reset ? <ResetStarter onReset={() => onChange(reset)} /> : null}
    </div>
  )
}
