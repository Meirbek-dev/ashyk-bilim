'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, LoaderCircle } from 'lucide-react';

import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import type { AttemptHistoryItem } from '@/features/assessments/shared/AttemptHistoryList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface AttemptEntryMetric {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface AttemptEntryPanelProps {
  title: string;
  description?: string | null;
  metrics: AttemptEntryMetric[];
  historyItems: AttemptHistoryItem[];
  actionTitle: string;
  actionDescription: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionPending?: boolean;
  blockedMessage?: string | null;
  onAction?: () => void;
  notices?: ReactNode;
}

export default function AttemptEntryPanel({
  title,
  description,
  metrics,
  historyItems,
  actionTitle,
  actionDescription,
  actionLabel,
  actionDisabled = false,
  actionPending = false,
  blockedMessage = null,
  onAction,
  notices,
}: AttemptEntryPanelProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {metrics.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-md border p-3"
              >
                <Icon className="text-muted-foreground mb-2 size-4" />
                <div className="text-muted-foreground text-xs">{label}</div>
                <div className="text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>

          {notices ? <div className="space-y-4">{notices}</div> : null}
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{actionTitle}</CardTitle>
            <CardDescription>{actionDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {onAction && actionLabel ? (
              <Button
                className="w-full"
                size="lg"
                disabled={actionDisabled || actionPending}
                onClick={onAction}
              >
                {actionPending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                {actionLabel}
              </Button>
            ) : null}
            {blockedMessage ? <p className="text-muted-foreground text-sm">{blockedMessage}</p> : null}
          </CardContent>
        </Card>

        <AttemptHistoryList items={historyItems} />
      </aside>
    </div>
  );
}
