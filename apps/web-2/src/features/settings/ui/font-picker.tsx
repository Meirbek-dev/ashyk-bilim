import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { FONTS, type Font } from '#/shared/lib/appearance'
import { FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

// Typeface names are brands and read the same in every language; the system face is described, not named.
const names: Record<Font, () => string> = {
  inter: () => 'Inter + Geologica',
  geist: () => 'Geist',
  google: () => 'Google Sans',
  plex: () => 'IBM Plex Sans',
  'inter-tight': () => 'Inter Tight',
  'sn-pro': () => 'SN Pro',
  rubik: () => 'Rubik',
  ubuntu: () => 'Ubuntu Sans',
  onest: () => 'Onest',
  noto: () => 'Noto Sans',
  literata: () => 'Literata',
  system: m.settings_font_system,
}

const hints: Record<Font, () => string> = {
  inter: m.settings_font_inter_hint,
  geist: m.settings_font_geist_hint,
  google: m.settings_font_google_hint,
  plex: m.settings_font_plex_hint,
  'inter-tight': m.settings_font_inter_tight_hint,
  'sn-pro': m.settings_font_sn_pro_hint,
  rubik: m.settings_font_rubik_hint,
  ubuntu: m.settings_font_ubuntu_hint,
  onest: m.settings_font_onest_hint,
  noto: m.settings_font_noto_hint,
  literata: m.settings_font_literata_hint,
  system: m.settings_font_system_hint,
}

type FontPickerProps = { value: Font; onChange: (font: Font) => void }

/**
 * The font sets of tokens.css as radio cards. Each card carries its own `data-font`, so its name and the sample of
 * Kazakh letters are drawn in that set whatever the page shows now.
 */
export function FontPicker({ value, onChange }: FontPickerProps) {
  const id = useId()
  return (
    <FieldSet>
      <FieldLegend id={`${id}-legend`} variant="label">
        {m.settings_field_font()}
      </FieldLegend>
      <RadioGroup
        name="font"
        value={value}
        onValueChange={next => {
          const font = FONTS.find(entry => entry === next)
          if (font) onChange(font)
        }}
        aria-labelledby={`${id}-legend`}
        className="grid grid-cols-1 gap-2 @md:grid-cols-2"
      >
        {FONTS.map(font => (
          <FieldLabel
            key={font}
            htmlFor={`${id}-${font}`}
            data-font={font}
            className="flex w-full min-w-0 items-start gap-3 rounded-md border p-3 font-sans font-normal has-data-checked:border-foreground"
          >
            <RadioGroupItem
              id={`${id}-${font}`}
              value={font}
              aria-labelledby={`${id}-${font}-name`}
              aria-describedby={`${id}-${font}-hint`}
              className="mt-0.5"
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span id={`${id}-${font}-name`} className="font-heading text-base font-semibold">
                {names[font]()}
              </span>
              <span aria-hidden className="text-sm">
                {m.settings_font_sample()}
              </span>
              <span id={`${id}-${font}-hint`} className="text-sm text-muted-foreground">
                {hints[font]()}
              </span>
            </span>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
