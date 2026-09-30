import { useState } from 'react'
import { AlertTriangle, ChevronDown, Clock, Play, Settings, VolumeX } from 'lucide-react'
import { motion } from 'motion/react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@components/ui/separator'
import { Checkbox } from '@components/ui/checkbox'
import { Label } from '@components/ui/label'
import { cn } from '@/lib/utils'
import { TimeInput } from './TimeInput'

interface VideoDetails {
  startTime: number
  endTime: number | null
  autoplay: boolean
  muted: boolean
  [key: string]: unknown
}

interface VideoSettingsFormProps {
  videoDetails: VideoDetails
  setVideoDetails: (details: VideoDetails) => void
  t: AppTranslator
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function VideoSettingsForm({ videoDetails, setVideoDetails, t }: VideoSettingsFormProps) {
  const [isOpen, setIsOpen] = useState(false)

  const convertToSeconds = (minutes: number, seconds: number) => minutes * 60 + seconds

  const convertFromSeconds = (totalSeconds: number) => ({
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  })

  const startTimeParts = convertFromSeconds(videoDetails.startTime)
  const endTimeParts = videoDetails.endTime ? convertFromSeconds(videoDetails.endTime) : { minutes: 0, seconds: 0 }

  const updateStartTime = (minutes: number, seconds: number) => {
    const newStartTime = convertToSeconds(minutes, seconds)
    setVideoDetails({
      ...videoDetails,
      startTime: newStartTime,
      endTime: videoDetails.endTime && videoDetails.endTime <= newStartTime ? null : videoDetails.endTime,
    })
  }

  const updateEndTime = (minutes: number, seconds: number) => {
    const totalSeconds = convertToSeconds(minutes, seconds)
    if (totalSeconds > videoDetails.startTime) {
      setVideoDetails({ ...videoDetails, endTime: totalSeconds })
    }
  }

  const settingsCount = [
    videoDetails.startTime > 0,
    Boolean(videoDetails.endTime),
    videoDetails.autoplay,
    videoDetails.muted,
  ].filter(Boolean).length

  const hasTimingErrors = Boolean(videoDetails.endTime && videoDetails.endTime <= videoDetails.startTime)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        nativeButton={false}
        render={
          <div className="border-border bg-card hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors">
            <div className="flex items-center gap-3">
              <Settings size={15} className="text-gray-400" />
              <div>
                <span className="text-foreground/80 text-sm font-medium">{t('additionalSettings')}</span>
                <p className="text-xs text-gray-400">{t('additionalSettingsDescription')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settingsCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-50 px-1.5 text-xs font-medium text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                  {settingsCount}
                </span>
              )}
              <ChevronDown
                size={15}
                className={cn('text-gray-400 transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </div>
          </div>
        }
      />

      <CollapsibleContent className="overflow-hidden">
        <div className="border-border bg-card mt-2 space-y-5 rounded-lg border p-5">
          {/* Timing Controls */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
              <Clock size={13} />
              {t('timingControls')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <TimeInput
                label={t('startTimeLabel')}
                icon={Play}
                minutes={startTimeParts.minutes}
                seconds={startTimeParts.seconds}
                onMinutesChange={minutes => updateStartTime(minutes, startTimeParts.seconds)}
                onSecondsChange={seconds => updateStartTime(startTimeParts.minutes, seconds)}
                placeholder={t('minutesPlaceholder')}
                t={t}
              />
              <TimeInput
                label={t('endTimeLabel')}
                icon={Clock}
                minutes={endTimeParts.minutes}
                seconds={endTimeParts.seconds}
                onMinutesChange={minutes => updateEndTime(minutes, endTimeParts.seconds)}
                onSecondsChange={seconds => updateEndTime(endTimeParts.minutes, seconds)}
                placeholder={t('minutesPlaceholder')}
                disabled={hasTimingErrors}
                t={t}
              />
            </div>
            {hasTimingErrors && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/15"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-xs font-medium text-amber-700">{t('invalidTimeRange')}</p>
                  <p className="text-xs text-amber-600">
                    {t('endTimeGreaterThanStartTime', {
                      startTime: formatTime(videoDetails.startTime),
                    })}
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          <Separator />

          {/* Playback Options */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
              <Play size={13} />
              {t('playbackOptions')}
            </h4>
            <div className="space-y-2">
              <Label className="border-border hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors">
                <Checkbox
                  checked={videoDetails.autoplay}
                  onCheckedChange={checked => setVideoDetails({ ...videoDetails, autoplay: checked })}
                />
                <div className="flex items-center gap-2">
                  <Play size={14} className="shrink-0 text-gray-400" />
                  <div>
                    <span className="text-foreground/80 text-sm font-medium">{t('autoplay')}</span>
                    <p className="text-xs text-gray-400">{t('autoplayDescription')}</p>
                  </div>
                </div>
              </Label>
              <Label className="border-border hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors">
                <Checkbox
                  checked={videoDetails.muted}
                  onCheckedChange={checked => setVideoDetails({ ...videoDetails, muted: checked })}
                />
                <div className="flex items-center gap-2">
                  <VolumeX size={14} className="shrink-0 text-gray-400" />
                  <div>
                    <span className="text-foreground/80 text-sm font-medium">{t('startMuted')}</span>
                    <p className="text-xs text-gray-400">{t('startMutedDescription')}</p>
                  </div>
                </div>
              </Label>
            </div>
          </div>

          {/* No subtitle picker: there is no upload policy for caption files, so the
              picked File never reached storage and the learner player got nothing. */}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
