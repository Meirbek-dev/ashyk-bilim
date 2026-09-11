'use client'

import { useTranslations } from 'next-intl'

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'

interface AILanguageControlProps {
  value: string
  onValueChange: (value: string) => void
}

export function AILanguageControl({ value, onValueChange }: AILanguageControlProps) {
  const t = useTranslations('AiExperience.languageControl')
  // `items` lets the closed trigger show the label, not the raw value.
  const items = (['auto', 'kk', 'ru', 'en'] as const).map(code => ({ value: code, label: t(code) }))
  return (
    <Field className="max-w-xs">
      <FieldLabel>{t('label')}</FieldLabel>
      <Select value={value} onValueChange={nextValue => nextValue && onValueChange(nextValue)} items={items}>
        <SelectTrigger>
          <SelectValue placeholder={t('auto')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map(item => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{t('description')}</FieldDescription>
    </Field>
  )
}
