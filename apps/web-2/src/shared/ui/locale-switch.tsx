import { Languages } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'

import type { MenuChoice } from './choice-items'
import { ChoiceMenu } from './choice-menu'
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
  return <ChoiceMenu trigger={<IconButton label={choice.label} icon={<Languages aria-hidden />} />} choice={choice} />
}
