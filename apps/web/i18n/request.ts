import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, defaultTimeZone } from './config';
import { cookies } from 'next/headers';
import type { Locale } from './config';

const COOKIE_NAME = 'NEXT_LOCALE';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = (cookieStore.get(COOKIE_NAME)?.value as Locale) || defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: defaultTimeZone,
  };
});
