'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { Moon, Sun } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/providers/theme-provider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ThemeModeToggleProps {
  className?: string;
  label?: string;
}

export function ThemeModeToggle({ className, label }: ThemeModeToggleProps) {
  const { resolvedTheme, toggleMode } = useTheme();
  const t = useTranslations('Components.NavMenu');
  const isDark = resolvedTheme === 'dark';
  const accessibleLabel = label ?? (isDark ? t('switchToLight') : t('switchToDark'));

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    toggleMode({ x: event.clientX, y: event.clientY });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <SwitchPrimitive.Root
              checked={isDark}
              onClick={handleClick}
              aria-label={accessibleLabel}
              className={cn(
                'peer group/theme-toggle focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                isDark ? 'bg-primary' : 'bg-input',
                className,
              )}
            >
              <SwitchPrimitive.Thumb
                className={cn(
                  'bg-background pointer-events-none flex size-5 items-center justify-center rounded-full shadow-lg ring-0 transition-transform',
                  isDark ? 'translate-x-5' : 'translate-x-0',
                )}
              >
                {isDark ? <Moon className="size-3" /> : <Sun className="size-3" />}
              </SwitchPrimitive.Thumb>
            </SwitchPrimitive.Root>
          }
        />
        <TooltipContent>{accessibleLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
