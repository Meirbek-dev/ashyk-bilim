'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/components/providers/theme-provider';
import { getThemePreviewColors } from '@/lib/theme-color-utils';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className }: ThemeSelectorProps) {
  const { theme: currentTheme, themes, setTheme } = useTheme();
  const t = useTranslations('DashPage.UserAccountSettings.generalSection.themeSelector');
  const tThemes = useTranslations('Themes');

  const themeItems = themes.map((theme) => {
    const colors = getThemePreviewColors(theme);
    return {
      value: theme.name,
      label: (
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div
              className="border-border h-4 w-4 shrink-0 rounded border"
              style={{ backgroundColor: colors.primary }}
            />
            <div
              className="border-border h-4 w-4 shrink-0 rounded border"
              style={{ backgroundColor: colors.secondary }}
            />
            <div
              className="border-border h-4 w-4 shrink-0 rounded border"
              style={{ backgroundColor: colors.accent }}
              title="Accent"
            />
          </div>
          <div className="flex flex-col">
            <span className="font-medium">{tThemes(`${theme.name}.name`)}</span>
            <span className="text-muted-foreground text-xs">{tThemes(`${theme.name}.description`)}</span>
          </div>
        </div>
      ),
    };
  });
  const currentColors = getThemePreviewColors(currentTheme);

  function handleValueChange(value: string) {
    setTheme(value);
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Label className="text-base font-medium">{t('title')}</Label>

      <div className="space-y-3">
        <Select
          value={currentTheme.name}
          onValueChange={(value) => value && handleValueChange(value)}
          items={themeItems}
        >
          <SelectTrigger className="w-full sm:w-[300px]">
            <SelectValue>
              <div className="flex items-center gap-3">
                {/* Theme color preview - using OKLCH colors */}
                <div className="flex gap-1">
                  <div
                    className="border-border h-4 w-4 shrink-0 rounded border"
                    style={{ backgroundColor: currentColors.primary }}
                  />
                  <div
                    className="border-border h-4 w-4 shrink-0 rounded border"
                    style={{ backgroundColor: currentColors.secondary }}
                  />
                  <div
                    className="border-border h-4 w-4 shrink-0 rounded border"
                    style={{ backgroundColor: currentColors.accent }}
                  />
                </div>
                <span className="font-medium">{tThemes(`${currentTheme.name}.name`)}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {themeItems.map((theme) => (
                <SelectItem
                  key={theme.value}
                  value={theme.value}
                >
                  {theme.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Optional: Show current theme description */}
        <p className="text-muted-foreground text-xs">{tThemes(`${currentTheme.name}.description`)}</p>
      </div>
    </div>
  );
}
