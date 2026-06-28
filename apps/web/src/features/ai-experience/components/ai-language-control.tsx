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
  return (
    <Field className="max-w-xs">
      <FieldLabel>{t('label')}</FieldLabel>
      <Select value={value} onValueChange={nextValue => nextValue && onValueChange(nextValue)}>
        <SelectTrigger>
          <SelectValue placeholder={t('auto')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="auto">{t('auto')}</SelectItem>
            <SelectItem value="kk">{t('kk')}</SelectItem>
            <SelectItem value="ru">{t('ru')}</SelectItem>
            <SelectItem value="en">{t('en')}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{t('description')}</FieldDescription>
    </Field>
  )
}
