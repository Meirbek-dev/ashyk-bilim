import { Moon, Sun, SunMoon } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { MODES, readAppearance, saveMode, type Mode } from '#/shared/lib/appearance'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { ChoiceItems, type MenuChoice } from './choice-items'
import { IconButton } from './icon-button'

const labels: Record<Mode, () => string> = {
  system: m.ui_mode_system,
  light: m.ui_mode_light,
  dark: m.ui_mode_dark,
}

const icons: Record<Mode, typeof Sun> = { system: SunMoon, light: Sun, dark: Moon }

/** System / light / dark, saved in a cookie and applied without a reload. */
export function useModeChoice(): MenuChoice & { mode: Mode } {
  const [mode, setMode] = useState(() => readAppearance().mode)
  return {
    mode,
    label: m.ui_mode(),
    value: mode,
    options: MODES.map(value => ({ value, label: labels[value]() })),
    onValueChange: value => {
      const next = MODES.find(entry => entry === value)
      if (!next) return
      saveMode(next)
      setMode(next)
    },
  }
}

/** The mode as an icon button with a menu (the guest top bar; signed-in users find it in the profile menu). */
export function ModeSwitch() {
  const choice = useModeChoice()
  const Icon = icons[choice.mode]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={choice.label} icon={<Icon aria-hidden />} />} />
      <DropdownMenuContent align="end">
        <ChoiceItems choice={choice} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
