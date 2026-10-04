import { Languages } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { ChoiceItems, type MenuChoice } from './choice-items'
import { IconButton } from './icon-button'

/** The interface language; each option is named in its own language. Paraglide saves it and reloads. */
export const localeChoice = (): MenuChoice => ({
  label: m.ui_locale(),
  value: getLocale(),
  options: locales.map(locale => ({ value: locale, label: m.ui_locale_name({}, { locale }), lang: locale })),
  onValueChange: value => {
    const locale = locales.find(entry => entry === value)
    if (locale) void setLocale(locale)
  },
})

/** The language as an icon button with a menu (the guest top bar; signed-in users use the profile menu). */
export function LocaleSwitch() {
  const choice = localeChoice()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={choice.label} icon={<Languages aria-hidden />} />} />
      <DropdownMenuContent align="end">
        <ChoiceItems choice={choice} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
