'use client'

import { useState, useEffect } from 'react'
import { CheckIcon, ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useSourceCourseSearch } from './useSourceCourseSearch'
import type { SourceCourseOption } from './course-create-types'

interface SourceCourseComboboxProps {
  value: string
  onSelect: (courseUuid: string, courseName: string) => void
  /** Pre-resolved course name for the currently selected value (from URL param) */
  initialSelectedName?: string
  id?: string
}

export function SourceCourseCombobox({ value, onSelect, initialSelectedName, id }: SourceCourseComboboxProps) {
  const t = useTranslations('DashPage.CourseManagement.Create')
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState<string>(initialSelectedName ?? '')

  const { query, options, state, search } = useSourceCourseSearch()

  // If there's a pre-selected value but we haven't resolved the name yet,
  // try to find it once options load
  useEffect(() => {
    if (value && !selectedName && options.length > 0) {
      const match = options.find(o => o.courseUuid === value)
      if (match) setSelectedName(match.name)
    }
  }, [value, selectedName, options])

  const handleSelect = (option: SourceCourseOption) => {
    setSelectedName(option.name)
    onSelect(option.courseUuid, option.name)
    setOpen(false)
  }

  const displayValue = selectedName || value || ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t('structure.copyOutline.sourceCourseLabel')}
            className="h-10 w-full justify-between font-normal"
          />
        }
      >
        <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
          {displayValue || t('structure.copyOutline.selectPlaceholder')}
        </span>
        <ChevronsUpDown className="text-muted-foreground ml-2 size-4 shrink-0" aria-hidden />
      </PopoverTrigger>

      <PopoverContent
        className="w-full p-0"
        style={{ width: 'var(--radix-popover-trigger-width, 320px)' }}
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('structure.copyOutline.searchPlaceholder')}
            value={query}
            onValueChange={search}
          />
          <CommandList>
            {state === 'loading' && (
              <div className="text-muted-foreground py-4 text-center text-sm">
                {t('structure.copyOutline.searching')}
              </div>
            )}
            {state === 'error' && (
              <div className="text-destructive py-4 text-center text-sm">{t('structure.copyOutline.searchError')}</div>
            )}
            {state !== 'loading' && state !== 'error' && (
              <>
                <CommandEmpty>{t('structure.copyOutline.noResults')}</CommandEmpty>
                <CommandGroup>
                  {options.map(option => (
                    <CommandItem
                      key={option.courseUuid}
                      value={option.courseUuid}
                      onSelect={() => handleSelect(option)}
                      className="cursor-pointer"
                    >
                      <span className="flex-1 truncate">{option.name}</span>
                      {value === option.courseUuid && (
                        <CheckIcon className="text-primary ml-2 size-4 shrink-0" aria-hidden />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
