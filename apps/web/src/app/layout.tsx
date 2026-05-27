import { ThemeScript } from '@/components/providers/theme-script';
import { defaultLocale } from '@/i18n/config';
import { DEFAULT_THEME_MODE, DEFAULT_THEME_NAME, getTheme } from '@/lib/themes';
import {
  getThemeFontStylesheetHref,
  resolveThemeFontFamilies,
  THEME_FONT_FAMILIES_ATTRIBUTE,
  THEME_FONT_LINK_ATTRIBUTE,
} from '@/lib/theme-fonts';
import type { CSSProperties } from 'react';
import { Suspense } from 'react';

import '@styles/globals.css';

function getThemeStyle(theme: ReturnType<typeof getTheme>): CSSProperties {
  return {
    colorScheme: theme.resolvedTheme,
    ...Object.fromEntries(Object.entries(theme.tokens).map(([key, value]) => [`--${key}`, value])),
  };
}

const initialTheme = getTheme(DEFAULT_THEME_NAME, DEFAULT_THEME_MODE);
const initialThemeFontHref = getThemeFontStylesheetHref(initialTheme.tokens);
const initialThemeFontFamilies = resolveThemeFontFamilies(initialTheme.tokens);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      data-mode={initialTheme.resolvedTheme}
      data-theme={initialTheme.name}
      lang={defaultLocale}
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

      <body
        className="relative"
        suppressHydrationWarning
      >
        <div className="relative isolate flex min-h-svh flex-col">
          {/*
           * LocaleLayout (and all its children) awaits `params`, `cookies()`,
           * and `getSession()` — all dynamic APIs in cacheComponents mode.
           * This Suspense in the fully-static root layout is the correct boundary:
           * the <html>/<head>/<body> shell is streamed immediately, then the
           * locale segment hydrates once its dynamic data resolves.
           */}
          <Suspense
            fallback={
              // Raw inline fallback — cannot use <Spinner> here because it calls
              // useTranslations(), which requires NextIntlClientProvider.
              // That provider only mounts inside LocaleLayout (our Suspense child),
              // so the fallback must be fully self-contained with no i18n dependency.
              <main className="flex min-h-svh items-center justify-center">
                <svg
                  aria-label="Loading"
                  className="size-8 animate-spin text-primary"
                  fill="none"
                  role="status"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    fill="currentColor"
                  />
                </svg>
              </main>
            }
          >
            {children}
          </Suspense>
        </div>
      </body>
    </html>
  );
}
