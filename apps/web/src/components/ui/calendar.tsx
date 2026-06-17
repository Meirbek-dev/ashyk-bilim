'use client'

import { DayPicker, getDefaultClassNames } from '@daypicker/react'
import type { DayButtonProps, Locale } from '@daypicker/react'
import * as React from 'react'
import { useTranslations } from 'next-intl'

import {
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const DEFAULT_MIN_DATE = new Date(1900, 0, 1)

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  locale,
  formatters,
  components,
  // allow callers to set a min/max date range; sane defaults for far past/future
  minDate = DEFAULT_MIN_DATE,
  maxDate,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
  minDate?: Date
  maxDate?: Date
}) {
  const defaultClassNames = getDefaultClassNames()

  // Default `toDate` to 50 years in the future so the year dropdown and navigation
  // don't stop at the end of the current year (e.g. 31.12.2025)
  const defaultMaxDate = (() => {
    const d = maxDate ? new Date(maxDate) : new Date()
    if (!maxDate) d.setFullYear(2077)
    d.setMonth(11)
    d.setDate(31)
    return d
  })()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: date => date.toLocaleString(locale?.code, { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn('relative rounded-(--cell-radius)', defaultClassNames.dropdown_root),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-medium select-none',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        // UPDATED: 'table' is deprecated in v10, changed to 'month_grid'
        month_grid: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
        week_number: cn('text-[0.8rem] text-muted-foreground select-none', defaultClassNames.week_number),
        day: cn(
          'group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-e-(--cell-radius)',
          props.showWeekNumber
            ? '[&:nth-child(2)[data-selected=true]_button]:rounded-s-(--cell-radius)'
            : '[&:first-child[data-selected=true]_button]:rounded-s-(--cell-radius)',
          defaultClassNames.day,
        ),
        range_start: cn(
          'relative isolate z-0 rounded-s-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:end-0 after:w-4 after:bg-muted',
          defaultClassNames.range_start,
        ),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn(
          'relative isolate z-0 rounded-e-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:start-0 after:w-4 after:bg-muted',
          defaultClassNames.range_end,
        ),
        today: cn(
          'rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none',
          defaultClassNames.today,
        ),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClassName, rootRef, ...rootProps }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(rootClassName)} {...rootProps} />
        },
        Chevron: ({ className: chevronClassName, orientation, ...chevronProps }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('rtl:rotate-180 size-4', chevronClassName)} {...chevronProps} />
          }

          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('rtl:rotate-180 size-4', chevronClassName)} {...chevronProps} />
          }

          return <ChevronDownIcon className={cn('size-4', chevronClassName)} {...chevronProps} />
        },
        DayButton: ({ ...dayButtonProps }) => <CalendarDayButton {...dayButtonProps} {...(locale ? { locale } : {})} />,
        WeekNumber: ({ children, ...weekNumberProps }) => {
          return (
            <td {...weekNumberProps}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
            </td>
          )
        },
        ...components,
      }}
      hidden={{ before: minDate, after: defaultMaxDate }}
      startMonth={minDate}
      endMonth={defaultMaxDate}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: DayButtonProps & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  const isFocused = modifiers.focused
  React.useEffect(() => {
    if (isFocused) ref.current?.focus()
  }, [isFocused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-e-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-s-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

function CalendarDatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
  buttonVariant = 'outline',
  disabled = false,
  locale,
  minDate = DEFAULT_MIN_DATE,
  maxDate,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
  disabled?: boolean
  locale?: Partial<Locale>
  minDate?: Date
  maxDate?: Date
}) {
  const [open, setOpen] = React.useState(false)
  const selectedDate = parseDateOnly(value)
  const datePickerProps = {
    mode: 'single' as const,
    required: false,
    captionLayout: 'dropdown' as const,
    selected: selectedDate,
    locale,
    minDate,
    maxDate,
    onSelect: (date: Date | undefined) => {
      if (!date) return
      onChange(formatDateOnlyValue(date))
      setOpen(false)
    },
  } as React.ComponentProps<typeof DayPicker>

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant={buttonVariant}
            disabled={disabled}
            className={cn(
              'w-full justify-start gap-2 text-left font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-4" />
        <span>{selectedDate ? formatDateOnly(selectedDate, locale) : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar {...datePickerProps} />
      </PopoverContent>
    </Popover>
  )
}

function CalendarDateTimePicker({
  id,
  value,
  onChange,
  placeholder = 'Выберите дату и время',
  className,
  buttonVariant = 'outline',
  disabled = false,
  locale,
  minDate = DEFAULT_MIN_DATE,
  maxDate,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
  disabled?: boolean
  locale?: Partial<Locale>
  minDate?: Date
  maxDate?: Date
}) {
  const t = useTranslations('Components.Calendar')
  const [open, setOpen] = React.useState(false)
  const parsedValue = parseDateTimeLocal(value)
  const [draftDate, setDraftDate] = React.useState<Date | undefined>(parsedValue ?? undefined)
  const [draftTime, setDraftTime] = React.useState(parsedValue ? formatTimeOnly(parsedValue) : '')
  const dateTimePickerProps = {
    mode: 'single' as const,
    required: false,
    captionLayout: 'dropdown' as const,
    selected: draftDate,
    locale,
    minDate,
    maxDate,
    onSelect: (date: Date | undefined) => {
      if (!date) return
      setDraftDate(date)
      setDraftTime(current => current || '00:00')
    },
  } as React.ComponentProps<typeof DayPicker>

  React.useEffect(() => {
    if (!open) return
    setDraftDate(parsedValue ?? undefined)
    setDraftTime(parsedValue ? formatTimeOnly(parsedValue) : '')
  }, [open, parsedValue])

  const commit = () => {
    if (!draftDate) return
    const nextDate = combineDateAndTime(draftDate, draftTime || '00:00')
    onChange(formatDateTimeLocalValue(nextDate))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant={buttonVariant}
            disabled={disabled}
            className={cn(
              'w-full justify-start gap-2 text-left font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarClock className="size-4" />
        <span>{parsedValue ? formatDateTimeDisplay(parsedValue, locale) : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <div className="space-y-3">
          <Calendar {...dateTimePickerProps} />
          <div className="flex items-center gap-2">
            <Clock3 className="text-muted-foreground size-4 shrink-0" />
            <Input
              type="time"
              value={draftTime}
              disabled={disabled || !draftDate}
              className="w-32"
              onChange={event => setDraftTime(event.target.value)}
            />
            <Button type="button" size="sm" disabled={disabled || !draftDate} onClick={commit}>
              {t('set')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function parseDateOnly(value: string) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateOnly(date: Date, locale?: Partial<Locale>) {
  return new Intl.DateTimeFormat(locale?.code, { dateStyle: 'medium' }).format(date)
}

function formatDateOnlyValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateTimeLocal(value: string) {
  if (!value) return undefined
  const parts = value.split('T')
  const datePart = parts[0]
  if (!datePart) return undefined
  const timePart = parts[1] || '00:00'
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours = 0, minutes = 0] = timePart.split(':').map(Number)
  if (!year || !month || !day) return undefined
  const date = new Date(year, month - 1, day, hours, minutes)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateTimeDisplay(date: Date, locale?: Partial<Locale>) {
  return new Intl.DateTimeFormat(locale?.code, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatTimeOnly(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function combineDateAndTime(date: Date, time: string) {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes)
}

function formatDateTimeLocalValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export { Calendar, CalendarDayButton, CalendarDatePicker, CalendarDateTimePicker }
