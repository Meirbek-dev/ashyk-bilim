import { useEffect, useId, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { ThemeManifest } from '#/shared/api/themes'
import { FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

type ThemePickerProps = { themes: ThemeManifest; value: string; onChange: (slug: string) => void }

/**
 * All shipped themes as stock radio cards; each shows its four preview colors (data from the manifest, not CSS). The
 * 63 cards scroll in a box under a name search, so on a phone mode, language and Save stay a short scroll away; the
 * chosen theme always stays in the list.
 */
export function ThemePicker({ themes, value, onChange }: ThemePickerProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const locale = getLocale()
  const shown = themes.filter(theme => theme.slug === value || theme.name[locale].toLocaleLowerCase().includes(needle))
  // The box opens on the chosen theme, wherever it is in the list (the box is the cards' offset parent).
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const card = box.current?.querySelector('[data-checked]')?.closest('label')
    if (box.current && card) box.current.scrollTop = card.offsetTop - 4
  }, [])
  return (
    <FieldSet>
      <FieldLegend id={`${id}-legend`} variant="label">
        {m.settings_field_theme()}
      </FieldLegend>
      <Input
        type="search"
        aria-label={m.settings_theme_search()}
        placeholder={m.settings_theme_search()}
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      <RadioGroup
        ref={box}
        name="theme"
        value={value}
        onValueChange={next => onChange(String(next))}
        aria-labelledby={`${id}-legend`}
        className="relative grid max-h-80 grid-cols-1 gap-2 overflow-y-auto p-0.5 @md:grid-cols-2 @2xl:grid-cols-3"
      >
        {shown.map(theme => (
          <FieldLabel
            key={theme.slug}
            htmlFor={`${id}-${theme.slug}`}
            className="flex min-h-row w-full min-w-0 items-center gap-3 rounded-md border px-3 font-normal has-data-checked:border-foreground"
          >
            <RadioGroupItem id={`${id}-${theme.slug}`} value={theme.slug} />
            <svg aria-hidden viewBox="0 0 4 1" className="h-4 w-16 shrink-0 rounded-sm border">
              {theme.preview.map((color, index) => (
                <rect key={index} x={index} width="1" height="1" fill={color} />
              ))}
            </svg>
            <span className="min-w-0 py-1 leading-tight">{theme.name[locale]}</span>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
