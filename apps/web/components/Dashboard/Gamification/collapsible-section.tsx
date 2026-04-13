/**
 * Collapsible Section Component
 *
 * Allows users to collapse gamification sections to reduce clutter.
 * Preference is saved to localStorage.
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  storageKey: string;
  defaultExpanded?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  storageKey,
  defaultExpanded = true,
  className = '',
}: CollapsibleSectionProps) {
  const t = useTranslations('DashPage.UserAccountSettings.Gamification');

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    const readState = () => {
      try {
        const savedState = localStorage.getItem(storageKey);
        return savedState !== null ? savedState === 'true' : defaultExpanded;
      } catch (error) {
        console.warn('Failed to load collapse state:', error);
        return defaultExpanded;
      }
    };

    setIsExpanded(readState());

    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        setIsExpanded(readState());
      }
    };

    globalThis.addEventListener('storage', onStorage);
    return () => {
      globalThis.removeEventListener('storage', onStorage);
    };
  }, [storageKey, defaultExpanded]);

  // Save preference to localStorage
  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);

    try {
      localStorage.setItem(storageKey, String(newState));
      // Trigger storage event manually for same-window updates
      globalThis.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
    } catch (error) {
      console.warn('Failed to save collapse state:', error);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 transition-transform"
            onClick={toggleExpanded}
            aria-label={isExpanded ? t('accessibility.collapseSection') : t('accessibility.expandSection')}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && <CardContent className="animate-in fade-in slide-in-from-top-2">{children}</CardContent>}
    </Card>
  );
}
