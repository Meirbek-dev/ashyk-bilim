import type { ComponentType } from 'react'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'

interface TimeInputProps {
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
  minutes: number
  seconds: number
  onMinutesChange: (minutes: number) => void
  onSecondsChange: (seconds: number) => void
  placeholder: string
  disabled?: boolean
  t: AppTranslator
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function TimeInput({
  label,
  icon: Icon,
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  placeholder,
  disabled = false,
  t,
}: TimeInputProps) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        <Icon size={13} className="text-gray-400" />
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="number"
            min="0"
            value={minutes}
            onChange={e => onMinutesChange(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            placeholder={placeholder}
            className="h-9 text-center tabular-nums"
            disabled={disabled}
          />
          <span className="mt-1 block text-center text-xs text-gray-400">{t('minutes')}</span>
        </div>
        <span className="pb-5 text-lg font-light text-gray-300">:</span>
        <div className="flex-1">
          <Input
            type="number"
            min="0"
            max="59"
            value={seconds}
            onChange={e => onSecondsChange(Math.max(0, Math.min(59, Number.parseInt(e.target.value, 10) || 0)))}
            placeholder={placeholder}
            className="h-9 text-center tabular-nums"
            disabled={disabled}
          />
          <span className="mt-1 block text-center text-xs text-gray-400">{t('seconds')}</span>
        </div>
      </div>
      <p className="text-xs text-gray-400 tabular-nums">{formatTime(minutes * 60 + seconds)}</p>
    </div>
  )
}
