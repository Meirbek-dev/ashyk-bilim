'use client';

import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export default function SaveStateBadge({ state }: { state: SaveState }) {
  const t = useTranslations('Components.SaveStateBadge');

  if (state === 'idle') return null;
  if (state === 'dirty') return <Badge variant="secondary">{t('unsaved')}</Badge>;
  if (state === 'saving')
    return (
      <Badge variant="secondary">
        <LoaderCircle className="size-3 animate-spin" />
        {t('saving')}
      </Badge>
    );
  if (state === 'error') return <Badge variant="destructive">{t('saveFailed')}</Badge>;
  return <Badge variant="success">{t('saved')}</Badge>;
}
