'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateUserLocale } from '@/lib/users/client';
import { useSession } from '@/hooks/useSession';
import { useLocale, useTranslations } from 'next-intl';
import { setUserLocale } from '@/i18n/locale';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import { Languages } from 'lucide-react';
import { locales } from '@/i18n/config';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

interface LocaleSwitcherProps {
  className?: string;
  isMobile?: boolean;
}

export const LocaleSwitcher = ({ className, isMobile }: LocaleSwitcherProps) => {
  const router = useRouter();
  const currentLocale = useLocale();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('Components.LocaleSwitcher');
  const { user: viewer } = useSession();

  const localeItems = locales.map((locale) => ({ value: locale, label: t(locale) }));

  const handleLocaleChange = (newLocale: Locale) => {
    startTransition(async () => {
      await setUserLocale(newLocale);

      // Sync to database if user is logged in
      if (viewer?.id) {
        try {
          await updateUserLocale(viewer.id, newLocale);
        } catch (error) {
          console.error('Failed to sync locale to server:', error);
        }
      }

      router.refresh();
    });
  };

  return (
    <Select
      value={currentLocale}
      onValueChange={(value) => value && handleLocaleChange(value as Locale)}
      disabled={isPending}
    >
      {isMobile ? (
        <SelectTrigger
          className={cn('w-auto touch-manipulation', isMobile && 'w-full', className)}
          aria-label={t('selectLanguage')}
        >
          <Languages size={22} />
          {isMobile ? <SelectValue placeholder={t('selectLanguage')}>{t(currentLocale)}</SelectValue> : null}
        </SelectTrigger>
      ) : (
        <SelectTrigger
          className={cn('w-auto touch-manipulation', isMobile && 'w-full', className)}
          aria-label={t('selectLanguage')}
          withChevron={false}
        >
          <Languages size={22} />
          {isMobile ? <SelectValue placeholder={t('selectLanguage')}>{t(currentLocale)}</SelectValue> : null}
        </SelectTrigger>
      )}
      <SelectContent
        className={cn(isMobile && 'z-80')}
        side="bottom"
        sideOffset={4}
      >
        <SelectGroup>
          {localeItems.map((locale) => (
            <SelectItem
              key={locale.value}
              value={locale.value}
            >
              {locale.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
