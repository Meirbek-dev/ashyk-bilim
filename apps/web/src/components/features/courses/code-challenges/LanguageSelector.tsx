'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface Language {
  id: number
  name: string
  monaco_language?: string
  is_archived?: boolean
}

interface LanguageSelectorProps {
  languages: Language[]
  selectedId: number | null
  onSelect: (languageId: number) => void
  allowedLanguages?: number[]
  disabled?: boolean
  className?: string
}

export function LanguageSelector({
  languages,
  selectedId,
  onSelect,
  allowedLanguages,
  disabled = false,
  className,
}: LanguageSelectorProps) {
  const t = useTranslations('Activities.CodeChallenges')

  // Filter languages if allowedLanguages is specified
  const availableLanguages = useMemo(() => {
    const activeLanguages = languages.filter(language => language.is_archived !== true)
    if (!allowedLanguages || allowedLanguages.length === 0) {
      return activeLanguages
    }
    return activeLanguages.filter(lang => allowedLanguages.includes(lang.id))
  }, [languages, allowedLanguages])

  // Sort languages alphabetically
  const sortedLanguages = useMemo(() => {
    return [...availableLanguages].toSorted((a, b) => a.name.localeCompare(b.name))
  }, [availableLanguages])

  const selectedLanguage = useMemo(
    () => availableLanguages.find(lang => lang.id === selectedId),
    [availableLanguages, selectedId],
  )

  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={triggerProps => (
          <Button
            {...triggerProps}
            variant="outline"
            role="combobox"
            aria-controls={triggerProps['aria-controls'] || 'language-listbox'}
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
            {sortedLanguages.map(lang => (
              <CommandItem
                key={lang.id}
                value={lang.name}
                onSelect={() => {
                  onSelect(lang.id)
                  setOpen(false)
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
  )
}
