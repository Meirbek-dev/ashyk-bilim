import { routing } from '@/i18n/routing'
import { DEFAULT_THEME_MODE, THEME_MODE_STORAGE_KEY } from '@/lib/themes'
import type { ThemeMode } from '@/lib/themes'
import RootProviders from '../root-providers'
import { HtmlLangSync } from '@/components/providers/HtmlLangSync'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { Suspense } from 'react'

interface LocaleLayoutProps {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

function getInitialThemeMode(rawMode: string | undefined): ThemeMode {
  return rawMode === 'dark' ? 'dark' : DEFAULT_THEME_MODE
}

async function ThemeProvider({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const initialThemeMode = getInitialThemeMode(cookieStore.get(THEME_MODE_STORAGE_KEY)?.value)
  return <RootProviders initialThemeMode={initialThemeMode}>{children}</RootProviders>
}

function LocaleLayoutFallback() {
  return <main className="bg-background min-h-svh" />
}

export default function LocaleLayout({ children, params }: LocaleLayoutProps) {
  return (
    <Suspense fallback={<LocaleLayoutFallback />}>
      <LocaleLayoutContent params={params}>{children}</LocaleLayoutContent>
    </Suspense>
  )
}

async function LocaleLayoutContent({ children, params }: LocaleLayoutProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLangSync locale={locale} />
      <Suspense fallback={null}>
        <ThemeProvider>{children}</ThemeProvider>
      </Suspense>
    </NextIntlClientProvider>
  )
}
