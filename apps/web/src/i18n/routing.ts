import { defineRouting } from 'next-intl/routing'
import { defaultLocale, localePrefixes, locales } from './config'

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: {
    mode: 'always',
    prefixes: localePrefixes,
  },
})
