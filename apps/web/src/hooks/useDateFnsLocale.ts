import { enUS, kk, ru } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { useLocale } from 'next-intl';

const localeMap: Record<string, Locale> = {
  'en-US': enUS,
  'kk-KZ': kk,
  'ru-RU': ru,
};

export function useDateFnsLocale(): Locale {
  const localeString = useLocale();
  // Default to 'ru' if the locale is not found in the map
  return localeMap[localeString] || ru;
}
