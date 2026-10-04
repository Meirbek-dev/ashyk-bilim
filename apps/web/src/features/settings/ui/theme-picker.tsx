import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { ThemeManifest } from '#/shared/api/themes'
import { FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

type ThemePickerProps = { themes: ThemeManifest; value: string; onChange: (slug: string) => void }

/** All shipped themes as stock radio cards; each shows its four preview colors (data from the manifest, not CSS). */
export function ThemePicker({ themes, value, onChange }: ThemePickerProps) {
  const id = useId()
  return (
    <FieldSet>
      <FieldLegend id={`${id}-legend`} variant="label">
        {m.settings_field_theme()}
      </FieldLegend>
      <RadioGroup
        name="theme"
        value={value}
        onValueChange={next => onChange(String(next))}
        aria-labelledby={`${id}-legend`}
        className="grid grid-cols-1 gap-2 @md:grid-cols-2 @2xl:grid-cols-3"
      >
        {themes.map(theme => (
          <FieldLabel
            key={theme.slug}
            htmlFor={`${id}-${theme.slug}`}
            className="flex min-h-row items-center gap-3 rounded-md border px-3 font-normal has-data-checked:border-foreground"
          >
            <RadioGroupItem id={`${id}-${theme.slug}`} value={theme.slug} />
            <svg aria-hidden viewBox="0 0 4 1" className="h-4 w-16 shrink-0 rounded-sm border">
              {theme.preview.map((color, index) => (
                <rect key={index} x={index} width="1" height="1" fill={color} />
              ))}
            </svg>
            <span className="min-w-0 truncate">{theme.name}</span>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
