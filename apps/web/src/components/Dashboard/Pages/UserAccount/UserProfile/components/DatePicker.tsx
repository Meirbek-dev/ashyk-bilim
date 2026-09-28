import { useState } from 'react'
import type { FC } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { Button } from '@components/ui/button'
import { Calendar } from '@components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import { useLocale } from 'next-intl'

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  placeholder: string
  disabled?: boolean
}

/** `YYYY-MM-DD` in, `YYYY-MM-DD` out (the stored profile shape); shown in the app locale. */
export const DatePicker: FC<DatePickerProps> = ({ value, onChange, placeholder, disabled = false }) => {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined
  const valid = selectedDate !== undefined && !Number.isNaN(selectedDate.getTime())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={`w-full justify-start text-left font-normal ${valid ? '' : 'text-muted-foreground'}`}
            disabled={disabled}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {valid ? selectedDate.toLocaleDateString(locale, { dateStyle: 'long' }) : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          {...(valid ? { selected: selectedDate, defaultMonth: selectedDate } : {})}
          onSelect={date => {
            if (date) {
              const pad = (n: number) => String(n).padStart(2, '0')
              onChange(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
