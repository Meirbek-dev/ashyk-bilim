import { useState } from 'react'
import type { FC } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { Button } from '@components/ui/button'
import { Calendar } from '@components/ui/calendar'
import { CalendarIcon } from 'lucide-react'
import type { Locale } from 'date-fns'
import { format } from 'date-fns'

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  placeholder?: string
  disabled?: boolean
  locale?: Locale
}

export const DatePicker: FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  locale,
}) => {
  const [open, setOpen] = useState(false)
  const selectedDate = value ? new Date(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={`w-full justify-start text-left font-normal ${!value && 'text-muted-foreground'}`}
            disabled={disabled}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value && selectedDate ? (
          locale ? (
            format(selectedDate, 'PPP', { locale })
          ) : (
            format(selectedDate, 'PPP')
          )
        ) : (
          <span>{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selectedDate}
          onSelect={date => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'))
              setOpen(false)
            }
          }}
          locale={locale}
        />
      </PopoverContent>
    </Popover>
  )
}
