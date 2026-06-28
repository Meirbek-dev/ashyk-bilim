'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'

type AILanguageControlProps = {
  value: string
  onValueChange: (value: string) => void
}

export function AILanguageControl({ value, onValueChange }: AILanguageControlProps) {
  return (
    <Field className="max-w-xs">
      <FieldLabel>Response language</FieldLabel>
      <Select value={value} onValueChange={nextValue => nextValue && onValueChange(nextValue)}>
        <SelectTrigger>
          <SelectValue placeholder="Auto" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="kk">Kazakh</SelectItem>
            <SelectItem value="ru">Russian</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>The AI follows course language when set to auto.</FieldDescription>
    </Field>
  )
}
