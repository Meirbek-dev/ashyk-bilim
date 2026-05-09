/**
 * Consolidated Empty States
 *
 * Single, flexible empty state component replacing multiple variants.
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Inbox, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: LucideIcon;
  action?: ReactNode;
  variant?: 'default' | 'info' | 'warning';
  className?: string;
}

const variantStyles = {
  default: 'text-muted-foreground',
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-orange-600 dark:text-orange-400',
} as const;

const defaultIcons = {
  default: Inbox,
  info: AlertCircle,
  warning: TrendingUp,
} as const;

export function EmptyState({ title, message, icon, action, variant = 'default', className = '' }: EmptyStateProps) {
  const Icon = icon || defaultIcons[variant];
  const colorClass = variantStyles[variant];

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Icon className={`mb-4 h-12 w-12 ${colorClass}`} />
          <p className={`mb-4 ${colorClass}`}>{message}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
