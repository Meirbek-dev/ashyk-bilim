import { useId } from 'react'

import type { LanguageInfo } from '#/shared/api/gen/types.gen'
import { Label } from '#/shared/ui/label'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { languageName } from './labels'

type LanguageSelectProps = {
  label: string
  value: string
  /** The languages to offer (slugs), in the author's order. */
  ids: string[]
  /** The platform's names; null when the sandbox is not configured ("Language python"). */
  languages: LanguageInfo[] | null
  onChange: (id: string) => void
  /** In the workspace toolbar: a small select, the label for screen readers only. */
  compact?: boolean
}

/** A language of the challenge, named by the platform (B-COD-05, B-COD-15). */
export function LanguageSelect({ label, value, ids, languages, onChange, compact = false }: LanguageSelectProps) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {label}
      </Label>
      <NativeSelect
        id={id}
        size={compact ? 'sm' : 'default'}
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {ids.map(option => (
          <NativeSelectOption key={option} value={option}>
            {languageName(languages, option)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
