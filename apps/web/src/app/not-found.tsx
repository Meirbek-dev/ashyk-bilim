import { getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { defaultLocale } from '@/i18n/config'
import LocaleNotFound from './[locale]/not-found'

// Same page as the localized one, with the default locale's messages.
export default async function NotFound() {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={defaultLocale} messages={messages}>
      <LocaleNotFound />
    </NextIntlClientProvider>
  )
}
