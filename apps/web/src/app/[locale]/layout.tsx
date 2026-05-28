import { routing } from '@/i18n/routing'
import { getSession } from '@/lib/auth/session'
import { DEFAULT_THEME_MODE, THEME_MODE_STORAGE_KEY } from '@/lib/themes'
import type { ThemeMode } from '@/lib/themes'
import RootProviders from '../root-providers'
import { HtmlLangSync } from '@/components/providers/HtmlLangSync'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale, getMessages } from 'next-intl/server'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

interface LocaleLayoutProps {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

function getInitialThemeMode(rawMode: string | undefined): ThemeMode {
  return rawMode === 'dark' ? 'dark' : DEFAULT_THEME_MODE
}

/**
 * All dynamic API access in this layout (params, cookies, getSession) is
 * covered by the <Suspense> in the root layout (app/layout.tsx), which is
 * the fully-static ancestor that owns the boundary for cacheComponents mode.
 */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const [cookieStore, initialSession, messages] = await Promise.all([cookies(), getSession(), getMessages()])
  const initialThemeMode = getInitialThemeMode(cookieStore.get(THEME_MODE_STORAGE_KEY)?.value)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLangSync locale={locale} />
      <RootProviders initialSession={initialSession} initialThemeMode={initialThemeMode}>
        {children}
      </RootProviders>
    </NextIntlClientProvider>
  )
}
