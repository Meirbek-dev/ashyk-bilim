'use client';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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

  const localeItems = locales.map((locale) => ({
    value: locale,
    label: t(locale),
  }));

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
    <div className={cn('flex items-center gap-2', isMobile && 'w-full', className)}>
      <Languages
        size={20}
        strokeWidth={1.5}
      />
      <NativeSelect
        value={currentLocale}
        onChange={(event) => handleLocaleChange(event.target.value as Locale)}
        disabled={isPending}
        className={cn('w-auto touch-manipulation', isMobile && 'w-full')}
        aria-label={t('selectLanguage')}
      >
        {localeItems.map((locale) => (
          <NativeSelectOption
            key={locale.value}
            value={locale.value}
          >
            {locale.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
};
