'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivitySquare, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AnalyticsEmptyStateProps {
  title: string;
  description: string;
}

export default function AnalyticsEmptyState({ title, description }: AnalyticsEmptyStateProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center px-4 py-10">
      <Card className="bg-card text-card-foreground border border-slate-200 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <CardHeader className="items-center text-center">
          <div className="bg-foreground text-background mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-md">
            <ActivitySquare
              className="h-7 w-7"
              aria-hidden="true"
            />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="max-w-2xl text-base">{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex items-center justify-center gap-3 text-sm">
          <Lock
            className="h-4 w-4"
            aria-hidden="true"
          />
          <span>{t('emptyState.accessNote')}</span>
        </CardContent>
      </Card>
    </div>
  );
}
