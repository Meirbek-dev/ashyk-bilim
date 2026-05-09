'use client';

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import type { ToasterProps } from 'sonner';
import { useTheme } from '@/components/providers/theme-provider';

const Toaster = ({ position = 'top-center', ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      position={position}
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon
            color="green"
            className="size-4"
          />
        ),
        info: (
          <InfoIcon
            color="blue"
            className="size-4"
          />
        ),
        warning: (
          <TriangleAlertIcon
            color="orange"
            className="size-4"
          />
        ),
        error: (
          <OctagonXIcon
            color="red"
            className="size-4"
          />
        ),
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
