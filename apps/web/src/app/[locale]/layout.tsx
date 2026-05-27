import { routing } from '@/i18n/routing';
import { getSession } from '@/lib/auth/session';
import { DEFAULT_THEME_MODE, THEME_MODE_STORAGE_KEY } from '@/lib/themes';
import type { ThemeMode } from '@/lib/themes';
import RootProviders from '../root-providers';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale, getMessages } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

function getInitialThemeMode(rawMode: string | undefined): ThemeMode {
  return rawMode === 'dark' ? 'dark' : DEFAULT_THEME_MODE;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // Explicitly opt into dynamic rendering.
  // getSession() makes an uncached network fetch (cache: 'no-store') which
  // Next.js 16 treats as a blocking-route violation when called outside <Suspense>.
  // connection() is the idiomatic signal that this layout requires a live request.
  await connection();

  const [cookieStore, initialSession, messages] = await Promise.all([cookies(), getSession(), getMessages()]);
  const initialThemeMode = getInitialThemeMode(cookieStore.get(THEME_MODE_STORAGE_KEY)?.value);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
    >
      {/*
       * Synchronously patch html[lang] on first paint.
       * The root layout sets lang={defaultLocale} as an SSR placeholder;
       * this script runs before any React hydration to correct it per-locale.
       * suppressHydrationWarning on <html> prevents the mismatch warning.
       */}
      <script
        suppressHydrationWarning
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(locale)};` }}
      />
      <RootProviders
        initialSession={initialSession}
        initialThemeMode={initialThemeMode}
      >
        {children}
      </RootProviders>
    </NextIntlClientProvider>
  );
}
