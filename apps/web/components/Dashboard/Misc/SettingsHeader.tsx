'use client';

import { DashBreadcrumbs, type DashBreadcrumbType } from '@/components/ui/app-breadcrumbs';
import React from 'react';

interface Props {
  breadcrumbType: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  headerClassName?: string;
  children?: React.ReactNode;
}

export default function SettingsHeader({
  breadcrumbType,
  title,
  description,
  headerClassName = 'bg-background z-10 border-b shadow-sm',
  children,
}: Props) {
  return (
    <header className={headerClassName}>
      <div className="px-6 lg:px-10">
        <DashBreadcrumbs type={breadcrumbType as DashBreadcrumbType} />

        <div className="pt-6 pb-4">
          <div className="max-w-7xl space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{title}</h1>
            {description && <p className="text-muted-foreground text-sm lg:text-base">{description}</p>}
          </div>
        </div>

        {children}
      </div>
    </header>
  );
}
