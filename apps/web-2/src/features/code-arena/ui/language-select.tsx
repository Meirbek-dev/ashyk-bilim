import { useId } from 'react'

import type { LanguageInfo } from '#/shared/api/gen/types.gen'
import { Label } from '#/shared/ui/label'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { languageName } from './labels'

type LanguageSelectProps = {
  label: string
  value: number
  /** The ids to offer, in the author's order. */
  ids: number[]
  /** The platform's names; null when the sandbox is not configured ("Language #71"). */
  languages: LanguageInfo[] | null
  onChange: (id: number) => void
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
        value={String(value)}
        onChange={event => onChange(Number(event.target.value))}
      >
        {ids.map(option => (
          <NativeSelectOption key={option} value={String(option)}>
            {languageName(languages, option)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}
