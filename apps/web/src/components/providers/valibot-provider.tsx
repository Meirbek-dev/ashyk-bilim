'use client'

import { useLocale } from 'next-intl'
import { useEffect } from 'react'
import * as v from 'valibot'
// Import available translations from @valibot/i18n

import '@valibot/i18n/ru'

export function ValibotProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale()

  useEffect(() => {
    // Map next-intl locales to valibot languages
    // 'ru-RU' -> 'ru'
    // 'en-US' -> 'en' (default valibot language)
    // 'kk-KZ' -> 'ru' (fallback to Russian since Kazakh is not supported officially yet, and ru is more widely understood than en there)
    const lang = locale.startsWith('en') ? 'en' : 'ru'
    v.setGlobalConfig({ lang })
  }, [locale])

  return <>{children}</>
}
