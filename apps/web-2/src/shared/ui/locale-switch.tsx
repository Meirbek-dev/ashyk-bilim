import { Languages } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'

import { ChoiceMenu } from './choice-menu'
import { IconButton } from './icon-button'

/** The interface language; each option is named in its own language. Paraglide saves it and reloads. */
export function LocaleSwitch() {
  return (
    <ChoiceMenu
      trigger={<IconButton label={m.ui_locale()} icon={<Languages aria-hidden />} />}
      value={getLocale()}
      options={locales.map(locale => ({ value: locale, label: m.ui_locale_name({}, { locale }), lang: locale }))}
      onValueChange={locale => void setLocale(locale)}
    />
  )
}
