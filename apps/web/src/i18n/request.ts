import { hasLocale } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { defaultTimeZone } from './config'
import { inlangToIcu } from './inlang-to-icu'
import { routing } from './routing'

const messagesByLocale = {
  'ru-RU': () => import('../messages/ru-RU.json'),
  'kk-KZ': () => import('../messages/kk-KZ.json'),
  'en-US': () => import('../messages/en-US.json'),
} satisfies Record<(typeof routing.locales)[number], () => Promise<{ default: unknown }>>

// The catalogs are in the inlang (Paraglide) format; next-intl needs ICU. Converted once per locale
// in production (dev converts per request so catalog edits show up without a restart).
const converted = new Map<string, Promise<AbstractIntlMessages>>()
function loadMessages(locale: (typeof routing.locales)[number]): Promise<AbstractIntlMessages> {
  let messages = converted.get(locale)
  if (!messages) {
    messages = messagesByLocale[locale]().then(module => inlangToIcu(module.default) as AbstractIntlMessages)
    if (process.env.NODE_ENV === 'production') converted.set(locale, messages)
  }
  return messages
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: defaultTimeZone,
  }
})
