import { getLocale, getMessages, setRequestLocale } from 'next-intl/server';
import { connection } from 'next/server';
import { IntlProvider } from '@/components/providers/IntlProvider';
import DevScriptLoader from '@/components/DevScriptLoader';
import { getSession } from '@/lib/auth/session';
import { inter, jetBrainsMono } from '@/lib/fonts';
import { Suspense } from 'react';
import RootProviders from './root-providers';

import '@styles/globals.css';

const isDevEnv = process.env.NODE_ENV !== 'production';

async function LocalizedApp({ children }: { children: React.ReactNode }) {
  await connection();
  const [locale, messages, initialSession] = await Promise.all([getLocale(), getMessages(), getSession()]);
  setRequestLocale(locale);

  return (
    <IntlProvider
      messages={messages}
      locale={locale}
    >
      <RootProviders initialSession={initialSession}>
        <main>{children}</main>
      </RootProviders>
    </IntlProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={`${inter.variable} ${jetBrainsMono.variable}`}
      lang="ru-RU"
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
      </head>

      <body suppressHydrationWarning>
        {isDevEnv && <DevScriptLoader />}
        <Suspense fallback={null}>
          <LocalizedApp>{children}</LocalizedApp>
        </Suspense>
      </body>
    </html>
  );
}
