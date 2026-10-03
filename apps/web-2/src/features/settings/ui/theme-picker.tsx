import { Field as BaseField } from '@base-ui/react/field'
import { Fieldset } from '@base-ui/react/fieldset'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'

import { m } from '#/paraglide/messages'
import type { ThemeManifest } from '#/shared/api/themes'

type ThemePickerProps = { themes: ThemeManifest; value: string; onChange: (slug: string) => void }

/** All shipped themes as radios; each shows its four preview colors (data from the manifest, not CSS). */
export function ThemePicker({ themes, value, onChange }: ThemePickerProps) {
  return (
    <BaseField.Root name="theme">
      <Fieldset.Root render={<RadioGroup value={value} onValueChange={onChange} className="flex flex-col gap-2" />}>
        <Fieldset.Legend className="text-sm font-medium">{m.settings_field_theme()}</Fieldset.Legend>
        <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
          {themes.map(theme => (
            <BaseField.Item key={theme.slug}>
              <BaseField.Label className="flex min-h-row items-center gap-3 rounded-md border px-3 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground has-data-checked:border-foreground">
                <Radio.Root
                  value={theme.slug}
                  className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background shadow-xs data-checked:border-primary"
                >
                  <Radio.Indicator className="size-2 rounded-full bg-primary" />
                </Radio.Root>
                <svg aria-hidden viewBox="0 0 4 1" className="h-4 w-16 shrink-0 rounded-sm border">
                  {theme.preview.map((color, index) => (
                    <rect key={index} x={index} width="1" height="1" fill={color} />
                  ))}
                </svg>
                <span className="min-w-0 truncate">{theme.name}</span>
              </BaseField.Label>
            </BaseField.Item>
          ))}
        </div>
      </Fieldset.Root>
    </BaseField.Root>
  )
}
