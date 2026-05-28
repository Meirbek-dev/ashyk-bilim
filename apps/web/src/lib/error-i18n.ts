/**
 * Standalone i18n dictionary for error boundary components.
 *
 * Error boundaries (`error.tsx`, `global-error.tsx`) can render outside the
 * `NextIntlClientProvider` tree, so they cannot use `next-intl` hooks.
 * This module provides a minimal shared fallback so both files stay in sync.
 */

export const ERROR_MESSAGES = {
  'ru-RU': {
    title: 'Что-то пошло не так',
    description:
      'Не удалось отобразить страницу. Вы можете повторить попытку или перезагрузить страницу, если ошибка повторится.',
    globalDescription: 'Произошла непредвиденная ошибка при загрузке страницы',
    error: 'Ошибка',
    errorId: 'Идентификатор ошибки:',
    updateInfo:
      'Ошибка может быть связана с обновлением приложения или временной недоступностью ресурсов. Полная перезагрузка страницы обычно решает проблему.',
    devDetails: 'Детали ошибки (dev)',
    retry: 'Повторить',
    defaultError: 'Не удалось корректно обработать запрос. Попробуйте повторить попытку.',
  },
  'en-US': {
    title: 'Something went wrong',
    description:
      'The page failed to render. You can retry, or reload if the error keeps returning.',
    globalDescription: 'An unexpected error occurred while loading the page',
    error: 'Error',
    errorId: 'Error ID:',
    updateInfo:
      'The error might be related to an application update or temporary unavailability of resources. A full page reload usually solves the problem.',
    devDetails: 'Error details (dev)',
    retry: 'Retry',
    defaultError: 'Failed to correctly process the request. Please try again.',
  },
  'kk-KZ': {
    title: 'Бірдеңе дұрыс болмады',
    description:
      'Бетті көрсету мүмкін болмады. Әрекетті қайталауға немесе қате қайталана берсе, бетті қайта жүктеуге болады.',
    globalDescription: 'Бетті жүктеу кезінде күтпеген қате орын алды',
    error: 'Қате',
    errorId: 'Қате идентификаторы:',
    updateInfo:
      'Қате қолданбаның жаңартылуына немесе ресурстардың уақытша қолжетімсіздігіне байланысты болуы мүмкін. Бетті толық қайта жүктеу әдетте мәселені шешеді.',
    devDetails: 'Қате туралы мәліметтер (dev)',
    retry: 'Қайталау',
    defaultError: 'Сұранысты дұрыс өңдеу мүмкін болмады. Қайталап көріңіз.',
  },
} as const

export type SupportedLocale = keyof typeof ERROR_MESSAGES

const SUPPORTED_LOCALES = Object.keys(ERROR_MESSAGES) as SupportedLocale[]

/**
 * Detect the user's locale from the `NEXT_LOCALE` cookie, with a
 * `navigator.language` fallback, defaulting to `'ru-RU'`.
 *
 * Must only be called in a browser context (i.e. inside `useEffect`).
 */
export function detectLocale(): SupportedLocale {
  // 1. NEXT_LOCALE cookie (most reliable — set by next-intl middleware)
  const cookieMatch = /NEXT_LOCALE=([^;]+)/.exec(document.cookie)
  const cookieLocale = cookieMatch?.[1] as SupportedLocale | undefined
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
    return cookieLocale
  }

  // 2. navigator.language (e.g. "ru", "en-US", "kk")
  const navLang = navigator.language
  const navMatch = SUPPORTED_LOCALES.find(
    l => l === navLang || l.startsWith(navLang) || navLang.startsWith(l.split('-')[0] ?? ''),
  )
  if (navMatch) return navMatch

  // 3. Hard default
  return 'ru-RU'
}
