import { Settings2 } from 'lucide-react'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'
import { Label } from '#/shared/ui/label'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '#/shared/ui/popover'
import { Switch } from '#/shared/ui/switch'

import { FONT_SIZES, type EditorPrefs, type FontSize } from '../../model/ide'

const fontLabels: Record<FontSize, () => string> = {
  sm: m.code_font_small,
  md: m.code_font_medium,
  lg: m.code_font_large,
}

/** One setting as a row of pressed / unpressed buttons under its name. */
function choice<T extends string | number>(
  label: string,
  options: readonly T[],
  current: T,
  name: (option: T) => string,
  pick: (option: T) => void,
) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex gap-1">
        {options.map(option => (
          <Button
            key={option}
            size="sm"
            variant={option === current ? 'secondary' : 'ghost'}
            aria-pressed={option === current}
            onClick={() => pick(option)}
          >
            {name(option)}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

type EditorSettingsProps = { prefs: EditorPrefs; onChange: (patch: Partial<EditorPrefs>) => void }

/** Text size, indent width and soft wrapping (B-COD-30): applied at once, kept for every challenge. */
export function EditorSettings({ prefs, onChange }: EditorSettingsProps) {
  const wrapId = useId()
  return (
    <Popover>
      <PopoverTrigger render={<IconButton label={m.code_settings()} icon={<Settings2 aria-hidden />} />} />
      <PopoverContent align="end" className="flex w-72 flex-col gap-4">
        <PopoverHeader>
          <PopoverTitle>{m.code_settings()}</PopoverTitle>
        </PopoverHeader>
        {choice(
          m.code_font_size(),
          FONT_SIZES,
          prefs.fontSize,
          size => fontLabels[size](),
          fontSize => onChange({ fontSize }),
        )}
        {choice(
          m.code_tab_size(),
          [2, 4] as const,
          prefs.tabSize,
          size => m.code_tab_spaces({ count: size }),
          tabSize => onChange({ tabSize }),
        )}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={wrapId}>{m.code_wrap()}</Label>
          <Switch id={wrapId} checked={prefs.wrap} onCheckedChange={wrap => onChange({ wrap })} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
