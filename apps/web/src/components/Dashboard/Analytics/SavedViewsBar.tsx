'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { AnalyticsQuery, SavedAnalyticsViewRow } from '@/types/analytics';
import { getSavedAnalyticsViews, saveAnalyticsView } from '@services/analytics/teacher';
import { Save, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface SavedViewsBarProps {
  query: AnalyticsQuery;
}

const serializeQuery = (query: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `/dash/analytics?${serialized}` : '/dash/analytics';
};

export default function SavedViewsBar({ query }: SavedViewsBarProps) {
  const router = useRouter();
  const t = useTranslations('Components.DashboardAnalytics');
  const [name, setName] = useState('');
  const [views, setViews] = useState<SavedAnalyticsViewRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSavedAnalyticsViews(query)
      .then((response) => {
        if (mounted) setViews(response.items);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [query]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t('savedViewsBar.nameFirst'));
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveAnalyticsView(
        {
          name: trimmedName,
          view_type: 'overview',
          query,
        },
        query,
      );
      setViews((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setName('');
      toast.success(t('savedViewsBar.saved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('savedViewsBar.couldNotSave'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {views.slice(0, 8).map((view) => (
            <Button
              key={view.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(serializeQuery(view.query))}
            >
              <Search className="h-3.5 w-3.5" />
              {view.name}
            </Button>
          ))}
          {!views.length ? (
            <span className="text-muted-foreground text-sm">{t('savedViewsBar.noSavedViews')}</span>
          ) : null}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('savedViewsBar.namePlaceholder')}
            className="sm:w-[220px]"
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="h-4 w-4" />
            {t('savedViewsBar.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
