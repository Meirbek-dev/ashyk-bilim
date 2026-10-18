import { routing } from '@/i18n/routing'
import { DEFAULT_THEME_MODE, THEME_MODE_STORAGE_KEY } from '@/lib/themes'
import type { ThemeMode } from '@/lib/themes'
import RootProviders from '../root-providers'
import { HtmlLangSync } from '@/components/providers/HtmlLangSync'
import { IntlPolyfillGate } from '@/components/providers/IntlPolyfillGate'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { APP_NAME, APP_THUMBNAIL_IMAGE_PATH } from '@/lib/constants'
import { getStaticMetadataMessages } from '@/lib/localized-metadata'

import { Suspense } from 'react'

interface LocaleLayoutProps {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params
  const description = getStaticMetadataMessages(locale).General.appDescription
  return {
    description,
    openGraph: {
      type: 'website',
      title: APP_NAME,
      siteName: APP_NAME,
      description,
      locale: locale.replace('-', '_'),
      images: [{ url: APP_THUMBNAIL_IMAGE_PATH, width: 1200, height: 630, alt: APP_NAME }],
    },
  }
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

  // Rendered from a Server Component, the provider inherits locale, messages, timeZone and now
  // from `src/i18n/request.ts`.
  return (
    <NextIntlClientProvider>
      <HtmlLangSync locale={locale} />
      <IntlPolyfillGate locale={locale}>
        <Suspense fallback={null}>
          <ThemeProvider>{children}</ThemeProvider>
        </Suspense>
      </IntlPolyfillGate>
    </NextIntlClientProvider>
  )
}
