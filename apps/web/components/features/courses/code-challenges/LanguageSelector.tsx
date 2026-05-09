'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Language {
  id: number;
  name: string;
}

interface LanguageSelectorProps {
  languages: Language[];
  selectedId: number | null;
  onSelect: (languageId: number) => void;
  allowedLanguages?: number[];
  disabled?: boolean;
  className?: string;
}

// Export a canonical list of Judge0 languages for consumers that expect it
// Python is the canonical default language and is intentionally placed first
export const JUDGE0_LANGUAGES: Language[] = [
  { id: 71, name: 'Python (3.8.1)' },
  { id: 50, name: 'C (GCC 9.2.0)' },
  { id: 54, name: 'C++ (GCC 9.2.0)' },
  { id: 51, name: 'C# (Mono 6.6.0.161)' },
  // { id: 60, name: 'Go (1.13.5)' },
  { id: 62, name: 'Java (OpenJDK 13.0.1)' },
  { id: 63, name: 'JavaScript (Node.js 12.14.0)' },
  // { id: 78, name: 'Kotlin (1.3.70)' },
  { id: 68, name: 'PHP (7.4.1)' },
  { id: 73, name: 'Rust (1.40.0)' },
  { id: 82, name: 'SQL (SQLite 3.27.2)' },
  { id: 83, name: 'Swift (5.2.3)' },
  { id: 74, name: 'TypeScript (3.7.4)' },
];

export function LanguageSelector({
  languages,
  selectedId,
  onSelect,
  allowedLanguages,
  disabled = false,
  className,
}: LanguageSelectorProps) {
  const t = useTranslations('Activities.CodeChallenges');

  // Filter languages if allowedLanguages is specified
  const availableLanguages = useMemo(() => {
    if (!allowedLanguages || allowedLanguages.length === 0) {
      return languages;
    }
    return languages.filter((lang) => allowedLanguages.includes(lang.id));
  }, [languages, allowedLanguages]);

  // Sort languages alphabetically
  const sortedLanguages = useMemo(() => {
    return [...availableLanguages].toSorted((a, b) => a.name.localeCompare(b.name));
  }, [availableLanguages]);

  const selectedLanguage = useMemo(
    () => availableLanguages.find((lang) => lang.id === selectedId),
    [availableLanguages, selectedId],
  );

  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            variant="outline"
            role="combobox"
            aria-controls={triggerProps['aria-controls'] || "language-listbox"}
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-[200px] justify-between', className)}
          >
            {selectedLanguage?.name || t('selectLanguage')}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      />
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder={t('searchLanguage')} />
          <CommandList>
            <CommandEmpty>{t('noLanguageFound')}</CommandEmpty>
            {sortedLanguages.map((lang) => (
              <CommandItem
                key={lang.id}
                value={lang.name}
                onSelect={() => {
                  onSelect(lang.id);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', selectedId === lang.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{lang.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default LanguageSelector;
