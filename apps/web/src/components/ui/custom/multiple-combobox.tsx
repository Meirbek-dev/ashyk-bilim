'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react'

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface MultiSelectComboboxProps<T> {
  options: T[]
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
  getOptionValue: (option: T) => string | number
  getOptionLabel: (option: T) => string
  label?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  maxShownItems?: number
}

export default function MultiSelectCombobox<T>({
  options,
  value,
  onChange,
  getOptionValue,
  getOptionLabel,
  label,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  maxShownItems = 4,
}: MultiSelectComboboxProps<T>) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const t = useTranslations('MultiSelectCombobox')

  const placeholderText = placeholder ?? t('placeholder')
  const searchPlaceholderText = searchPlaceholder ?? t('searchPlaceholder')
  const emptyMessageText = emptyMessage ?? t('emptyMessage')

  const toggleSelection = (optionValue: string | number) => {
    onChange(value.includes(optionValue) ? value.filter(v => v !== optionValue) : [...value, optionValue])
  }

  const removeSelection = (optionValue: string | number) => {
    onChange(value.filter(v => v !== optionValue))
  }

  const visibleItems = expanded ? value : value.slice(0, maxShownItems)
  const hiddenCount = value.length - visibleItems.length

  const getOptionByValue = (val: string | number) => options.find(opt => getOptionValue(opt) === val)

  return (
    <div className="w-full space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-listbox`}
              className="h-auto min-h-8 w-full justify-between hover:bg-transparent"
            >
              <div className="flex flex-wrap items-center gap-1 pe-2.5">
                {value.length > 0 ? (
                  <>
                    {visibleItems.map(val => {
                      const option = getOptionByValue(val)
                      if (!option) return null

                      return (
                        <Badge key={val} variant="outline" className="rounded-sm">
                          {getOptionLabel(option)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-4"
                            nativeButton={false}
                            onClick={e => {
                              e.stopPropagation()
                              removeSelection(val)
                            }}
                            render={
                              <span>
                                <XIcon className="size-3" />
                              </span>
                            }
                          />
                        </Badge>
                      )
                    })}
                    {hiddenCount > 0 || expanded ? (
                      <Badge
                        variant="outline"
                        onClick={e => {
                          e.stopPropagation()
                          setExpanded(prev => !prev)
                        }}
                        className="cursor-pointer rounded-sm"
                      >
                        {expanded ? t('showLess') : t('moreItems', { count: hiddenCount })}
                      </Badge>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">{placeholderText}</span>
                )}
              </div>
              <ChevronsUpDownIcon className="text-muted-foreground/80 shrink-0" aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent className="w-auto min-w-(--anchor-width) p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholderText} />
            <CommandList>
              <CommandEmpty>{emptyMessageText}</CommandEmpty>
              <CommandGroup>
                {options.map(option => {
                  const optionValue = getOptionValue(option)
                  return (
                    <CommandItem
                      key={optionValue}
                      value={String(optionValue)}
                      onSelect={() => toggleSelection(optionValue)}
                    >
                      <span className="truncate">{getOptionLabel(option)}</span>
                      {value.includes(optionValue) && <CheckIcon size={16} className="ms-auto" />}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
