'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { cn } from '@/lib/utils';
import React from 'react';

export interface TabItem {
  id: string;
  labelKey: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface Props {
  value: string;
  tabs: TabItem[];
  getHref?: (tab: TabItem) => string;
  translationNamespace: string;
  className?: string;
  renderTab?: (tab: TabItem, isActive: boolean) => React.ReactNode;
}

export default function SettingsTabs({
  value,
  tabs,
  getHref,
  translationNamespace,
  className = 'w-full',
  renderTab,
}: Props) {
  const t = useTranslations(translationNamespace);

  const defaultRender = (tab: TabItem, isActive: boolean) => {
    const Icon = tab.icon;

    return (
      <TabsTrigger
        value={tab.id}
        className={cn(
          'relative h-auto rounded-none border-b-2 bg-transparent px-4 pt-3 pb-2 font-semibold shadow-none transition-all',
          'hover:bg-muted/50',
          'focus-visible:ring-0 focus-visible:ring-offset-0',
          'data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none',
          isActive ? 'border-b-primary border-b-4 text-primary' : 'border-b-transparent text-muted-foreground',
        )}
      >
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon
              size={16}
              className={cn('transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}
            />
          )}
          <span className="text-sm">{t ? t(tab.labelKey) : tab.labelKey}</span>
        </div>
      </TabsTrigger>
    );
  };

  const render = (tab: TabItem) => {
    const isActive = value === tab.id;
    const inner = renderTab ? renderTab(tab, isActive) : defaultRender(tab, isActive);

    if (getHref) {
      return (
        <Link
          key={tab.id}
          href={getHref(tab)}
        >
          {inner}
        </Link>
      );
    }

    return <React.Fragment key={tab.id}>{inner}</React.Fragment>;
  };

  return (
    <Tabs
      value={value}
      className={className}
    >
      <TabsList className="h-auto w-full justify-start rounded-none border-b-0 bg-transparent p-0">
        {tabs.map((tab) => render(tab))}
      </TabsList>
    </Tabs>
  );
}
