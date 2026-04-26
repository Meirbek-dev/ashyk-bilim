'use client';

import { useCallback, useMemo, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/providers/theme-provider';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Moon, Shuffle, Sun } from 'lucide-react';

interface ThemeSelectorProps {
  className?: string;
}

const ColorBox = ({ color }: { color: string }) => (
  <div
    className="border-border h-3 w-3 rounded-sm border"
    style={{ backgroundColor: color }}
  />
);

const ThemeColors = ({
  colors,
}: {
  colors: { primary: string; secondary: string; accent: string; background: string };
}) => (
  <div className="flex gap-0.5">
    <ColorBox color={colors.primary} />
    <ColorBox color={colors.secondary} />
    <ColorBox color={colors.accent} />
    <ColorBox color={colors.background} />
  </div>
);

export function ThemeSelector({ className }: ThemeSelectorProps) {
  const { theme: currentTheme, themes, setTheme, isDark, toggleMode } = useTheme();
  const t = useTranslations('DashPage.UserAccountSettings.generalSection.themeSelector');
  const tThemes = useTranslations('Themes');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filteredThemes = useMemo(() => {
    if (!search.trim()) return [...themes];
    const lower = search.toLowerCase();
    return themes.filter((theme) => tThemes(`${theme.name}.name`).toLowerCase().includes(lower));
  }, [themes, search, tThemes]);

  const currentIndex = useMemo(
    () => themes.findIndex((th) => th.name === currentTheme.name),
    [themes, currentTheme.name],
  );

  const cycleTheme = useCallback(
    (direction: 'prev' | 'next') => {
      const len = themes.length;
      if (len === 0) return;
      const next = direction === 'next' ? (currentIndex + 1) % len : (currentIndex - 1 + len) % len;
      const nextTheme = themes[next];
      if (!nextTheme) return;
      setTheme(nextTheme.name);
    },
    [currentIndex, themes, setTheme],
  );

  const randomize = useCallback(() => {
    const len = themes.length;
    if (len === 0) return;
    const random = Math.floor(Math.random() * len);
    const nextTheme = themes[random];
    if (!nextTheme) return;
    setTheme(nextTheme.name);
  }, [themes, setTheme]);

  const handleModeToggle = useCallback(
    (e: React.MouseEvent) => {
      toggleMode({ x: e.clientX, y: e.clientY });
    },
    [toggleMode],
  );

  return (
    <TooltipProvider>
      <div className={cn('space-y-2', className)}>
        <Label className="text-base font-medium">{t('title')}</Label>

        <div className="flex items-stretch">
          {/* Popover trigger */}
          <Popover
            open={open}
            onOpenChange={setOpen}
          >
            <PopoverTrigger className="border-border bg-background hover:bg-muted focus-visible:ring-ring inline-flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg rounded-e-none border px-4 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:w-[420px]">
              <div className="flex min-w-0 items-center gap-3">
                <ThemeColors colors={currentTheme.colors} />
                <span className="text-left leading-tight whitespace-normal">
                  {tThemes(`${currentTheme.name}.name`)}
                </span>
              </div>
              <ChevronDown className="text-muted-foreground size-4 shrink-0" />
            </PopoverTrigger>

            <PopoverContent
              className="w-[300px] min-w-[var(--anchor-width)] p-0 sm:w-[360px]"
              align="start"
              sideOffset={4}
            >
              <Command>
                <CommandInput
                  placeholder={t('searchPlaceholder')}
                  value={search}
                  onValueChange={setSearch}
                />

                {/* Controls row */}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground text-sm">
                    {t('themeCount', { count: filteredThemes.length })}
                  </span>
                  <span className="text-sm leading-tight font-medium">
                    <Tooltip>
                      <TooltipTrigger
                        onClick={handleModeToggle}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5 transition-colors"
                      >
                        {isDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                      </TooltipTrigger>
                      <TooltipContent>{t('toggleMode')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        onClick={randomize}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5 transition-colors"
                      >
                        <Shuffle className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t('randomButtonTitle')}</TooltipContent>
                    </Tooltip>
                  </span>
                </div>

                <Separator />

                <CommandList className="max-h-[480px]">
                  <CommandEmpty>{t('noThemesFound')}</CommandEmpty>
                  <CommandGroup>
                    {filteredThemes.map((theme) => (
                      <CommandItem
                        key={theme.name}
                        value={theme.name}
                        onSelect={() => {
                          setTheme(theme.name);
                          setSearch('');
                          setOpen(false);
                        }}
                        className="data-[selected=true]:bg-primary/10 flex cursor-pointer items-center gap-3 py-2 transition-colors data-[selected=false]:bg-transparent"
                      >
                        <ThemeColors colors={theme.colors} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-medium">{tThemes(`${theme.name}.name`)}</span>
                          <span className="text-muted-foreground text-xs leading-snug whitespace-normal">
                            {tThemes(`${theme.name}.description`)}
                          </span>
                        </div>
                        {theme.name === currentTheme.name && <Check className="text-primary size-4 shrink-0" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Prev / next cycle buttons */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => cycleTheme('prev')}
                  className="h-auto rounded-none border-s-0"
                  aria-label={t('previousTheme')}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              }
            />
            <TooltipContent>{t('previousTheme')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => cycleTheme('next')}
                  className="h-auto rounded-s-none border-s-0"
                  aria-label={t('nextTheme')}
                >
                  <ArrowRight className="size-4" />
                </Button>
              }
            />

            <TooltipContent>{t('nextTheme')}</TooltipContent>
          </Tooltip>
        </div>

        <p className="text-muted-foreground text-xs">{tThemes(`${currentTheme.name}.description`)}</p>
      </div>
    </TooltipProvider>
  );
}
