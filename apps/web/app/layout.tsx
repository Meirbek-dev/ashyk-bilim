import { getLocale, getMessages, setRequestLocale } from 'next-intl/server';
import { IntlProvider } from '@/components/providers/IntlProvider';
import DevScriptLoader from '@/components/DevScriptLoader';
import { ThemeScript } from '@/components/providers/theme-script';
import { getSession } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { DEFAULT_THEME_MODE, DEFAULT_THEME_NAME, getTheme, THEME_MODE_STORAGE_KEY } from '@/lib/themes';
import {
  getThemeFontStylesheetHref,
  resolveThemeFontFamilies,
  THEME_FONT_FAMILIES_ATTRIBUTE,
  THEME_FONT_LINK_ATTRIBUTE,
} from '@/lib/theme-fonts';
import type { ThemeMode } from '@/lib/themes';
import type { CSSProperties } from 'react';
import { Suspense } from 'react';
import RootProviders from './root-providers';

import '@styles/globals.css';

const isDevEnv = process.env.NODE_ENV !== 'production';

function getThemeStyle(theme: ReturnType<typeof getTheme>): CSSProperties {
  return {
    colorScheme: theme.resolvedTheme,
    ...Object.fromEntries(Object.entries(theme.tokens).map(([key, value]) => [`--${key}`, value])),
  };
}

async function LocalizedApp({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialThemeMode = getInitialThemeMode(cookieStore.get(THEME_MODE_STORAGE_KEY)?.value);
  const [locale, messages, initialSession] = await Promise.all([getLocale(), getMessages(), getSession()]);

  setRequestLocale(locale);

  return (
    <IntlProvider
      messages={messages}
      locale={locale}
    >
      <RootProviders
        initialSession={initialSession}
        initialThemeMode={initialThemeMode}
      >
        <main>{children}</main>
      </RootProviders>
    </IntlProvider>
  );
}

function getInitialThemeMode(rawMode: string | undefined): ThemeMode {
  return rawMode === 'dark' ? 'dark' : DEFAULT_THEME_MODE;
}

const initialTheme = getTheme(DEFAULT_THEME_NAME, DEFAULT_THEME_MODE);
const initialThemeFontHref = getThemeFontStylesheetHref(initialTheme.tokens);
const initialThemeFontFamilies = resolveThemeFontFamilies(initialTheme.tokens);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      data-mode={initialTheme.resolvedTheme}
      data-theme={initialTheme.name}
      lang="ru-RU"
      style={getThemeStyle(initialTheme)}
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {initialThemeFontHref && (
          <link
            rel="stylesheet"
            href={initialThemeFontHref}
            {...{
              [THEME_FONT_LINK_ATTRIBUTE]: 'true',
              [THEME_FONT_FAMILIES_ATTRIBUTE]: initialThemeFontFamilies.join('|'),
            }}
          />
        )}
        <ThemeScript initialTheme={initialTheme} />
      </head>

      <body className="relative" suppressHydrationWarning>
        {isDevEnv && <DevScriptLoader />}
        <div className="isolate relative flex min-h-svh flex-col">
          <Suspense fallback={null}>
            <LocalizedApp>{children}</LocalizedApp>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
