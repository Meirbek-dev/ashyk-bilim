'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Monitor } from 'lucide-react';
import React from 'react';

interface Props {
  Icon?: React.ComponentType<{ className?: string; size?: number }>;
  children: React.ReactNode;
  title?: string;
  description?: string;
  supportingText?: string;
  className?: string;
}

export default function DesktopOnlyGuard({
  Icon = Monitor,
  children,
  title,
  description,
  supportingText,
  className,
}: Props) {
  const t = useTranslations('DashPage.UserSettings');
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className={cn('bg-muted/20 flex min-h-[100dvh] w-full items-center justify-center p-4 sm:p-6', className)}>
        <Card className="border-border/70 bg-background/95 w-full max-w-md border shadow-sm backdrop-blur">
          <CardContent className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col items-center text-center">
              <div className="bg-muted mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border">
                <Icon className="text-muted-foreground h-7 w-7" />
              </div>
              <div className="space-y-2.5">
                <h2 className="text-xl font-semibold tracking-tight">{title ?? t('desktopOnlyTitle')}</h2>
                <p className="text-muted-foreground text-sm leading-6">{description ?? t('desktopOnlyMessage1')}</p>
                <p className="text-muted-foreground/80 text-xs leading-5">
                  {supportingText ?? t('desktopOnlyMessage2')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
