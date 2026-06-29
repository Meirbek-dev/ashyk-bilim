import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { defaultTimeZone } from './config'
import { routing } from './routing'

const messagesByLocale = {
  'ru-RU': () => import('../messages/ru-RU.json'),
  'kk-KZ': () => import('../messages/kk-KZ.json'),
  'en-US': () => import('../messages/en-US.json'),
} satisfies Record<(typeof routing.locales)[number], () => Promise<{ default: unknown }>>

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await messagesByLocale[locale]()).default,
    timeZone: defaultTimeZone,
  }
})
