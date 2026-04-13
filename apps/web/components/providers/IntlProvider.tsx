'use client';

import { defaultTimeZone } from '@/i18n/config';
import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';

interface IntlProviderProps {
  children: React.ReactNode;
  messages: AbstractIntlMessages;
  locale: string;
}

function HtmlLangSync() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}

export function IntlProvider({ children, messages, locale }: IntlProviderProps) {
  // Stable initial time - only created once on mount
  const [now] = useState(() => new Date());

  return (
    <NextIntlClientProvider
      messages={messages}
      locale={locale}
      now={now}
      timeZone={defaultTimeZone}
    >
      <HtmlLangSync />
      {children}
    </NextIntlClientProvider>
  );
}
