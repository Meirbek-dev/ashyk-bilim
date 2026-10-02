import { Moon, Sun, SunMoon } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { MODES, readAppearance, saveMode, type Mode } from '#/shared/lib/appearance'

import { ChoiceMenu } from './choice-menu'
import { IconButton } from './icon-button'

const labels: Record<Mode, () => string> = {
  system: m.ui_mode_system,
  light: m.ui_mode_light,
  dark: m.ui_mode_dark,
}

const icons: Record<Mode, typeof Sun> = { system: SunMoon, light: Sun, dark: Moon }

/** System / light / dark, saved in a cookie and applied without a reload. */
export function ModeSwitch() {
  const [mode, setMode] = useState(() => readAppearance().mode)
  const Icon = icons[mode]
  return (
    <ChoiceMenu
      trigger={<IconButton label={m.ui_mode()} icon={<Icon aria-hidden />} />}
      value={mode}
      options={MODES.map(value => ({ value, label: labels[value]() }))}
      onValueChange={next => {
        saveMode(next)
        setMode(next)
      }}
    />
  )
}
