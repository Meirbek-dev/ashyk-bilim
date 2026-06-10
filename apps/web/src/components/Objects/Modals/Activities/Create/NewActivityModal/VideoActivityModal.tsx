'use client'

import { AlertCircle, AlertTriangle, CheckCircle2, FileVideo, Loader2, Plus, Upload } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { SiYoutube } from '@icons-pack/react-simple-icons'
import { constructAcceptValue } from '@/lib/constants'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { Button } from '@components/ui/button'
import { cn } from '@/lib/utils'
import { Label } from '@components/ui/label'
import { Input } from '@components/ui/input'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { usePlatform } from '@/components/Contexts/PlatformContext'
import { VideoSettingsForm } from './components/VideoSettingsForm'
import type { SubtitleFile } from './components/SubtitleManager'

const SUPPORTED_VIDEO_FILES = constructAcceptValue(['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv'])

interface VideoDetails {
  startTime: number
  endTime: number | null
  autoplay: boolean
  muted: boolean
  subtitles?: SubtitleFile[]
  [key: string]: unknown
}

interface ExternalVideoObject {
  name: string
  type: string
  uri: string
  chapter_id: number
  details: VideoDetails
  [key: string]: unknown
}

const VideoModal = ({ submitFileActivity, submitExternalVideo, chapterId, course }: AppActivityModalProps) => {
  const t = useTranslations('Components.VideoModal')
  const platform = usePlatform()
  const [video, setVideo] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [selectedView, setSelectedView] = useState<'file' | 'youtube'>('file')
  const [videoDetails, setVideoDetails] = useState<VideoDetails>({
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
    subtitles: [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Debug: Log platform data when component mounts or platform changes
  useEffect(() => {
    console.log('VideoModal - Context data:', {
      platform,
      hasPlatform: Boolean(platform),
      courseProp: course,
      courseData: course?.courseStructure || course,
    })
  }, [platform, course])

  const isYouTubeUrlValid = youtubeUrl ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(youtubeUrl) : false

  const validateForm = ({
    activityName,
    sourceType,
    selectedVideo,
    submittedYoutubeUrl,
  }: {
    activityName: string
    sourceType: 'file' | 'youtube'
    selectedVideo: File | null
    submittedYoutubeUrl: string
  }) => {
    const newErrors: Record<string, string> = {}

    const youtubeUrlIsValid = submittedYoutubeUrl
      ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(submittedYoutubeUrl)
      : false

    if (!activityName.trim()) {
      newErrors.name = t('errorActivityNameRequired')
    }

    if (sourceType === 'file' && !selectedVideo) {
      newErrors.video = t('errorPleaseSelectVideoFile')
    }

    if (sourceType === 'youtube' && !submittedYoutubeUrl.trim()) {
      newErrors.youtubeUrl = t('errorYouTubeUrlRequired')
    }

    if (sourceType === 'youtube' && submittedYoutubeUrl && !youtubeUrlIsValid) {
      newErrors.youtubeUrl = t('errorValidYouTubeUrl')
    }

    if (videoDetails.endTime && videoDetails.endTime <= videoDetails.startTime) {
      newErrors.timing = t('errorEndTimeGreaterThanStartTime')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      // Validate file size (max 1000MB)
      if (selectedFile.size > 1000 * 1024 * 1024) {
        toast.error(t('errorFileSizeLimit'))
        return
      }

      // Validate file type
      const validTypes = ['video/mp4', 'video/webm', 'video/x-matroska']
      if (!validTypes.includes(selectedFile.type)) {
        toast.error(t('errorInvalidVideoFileType'))
        return
      }

      setVideo(selectedFile)
      setErrors(prev => ({ ...prev, video: '' }))

      // Auto-populate name if empty
      if (!name) {
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, '')
        setName(fileName)
        setErrors(prev => ({ ...prev, name: '' }))
      }

      toast.success(t('successVideoFileSelected'))
    }
  }

  const canSubmit = (() => {
    if (!name.trim()) return false
    if (selectedView === 'file') return Boolean(video)
    if (selectedView === 'youtube') return isYouTubeUrlValid
    return false
  })()

  const handleSubmit = async (formData: FormData) => {
    const submittedName = String(formData.get('name') ?? '').trim()
    const submittedYoutubeUrl = String(formData.get('youtubeUrl') ?? '').trim()
    const submittedVideo = formData.get('videoFile')
    const selectedVideo = submittedVideo instanceof File && submittedVideo.size > 0 ? submittedVideo : video

    if (
      !validateForm({
        activityName: submittedName,
        sourceType: selectedView,
        selectedVideo,
        submittedYoutubeUrl,
      })
    ) {
      toast.error(t('errorFixErrorsBeforeSubmitting'))
      return
    }

    // Handle course data structure (it might be the context object or the course object directly)
    const courseData = course?.courseStructure || course

    if (!courseData?.course_uuid) {
      console.error('Course data missing:', course)
      toast.error(t('courseDataMissing'))
      return
    }

    setIsSubmitting(true)

    try {
      if (selectedView === 'file' && selectedVideo) {
        await submitFileActivity?.({
          file: selectedVideo,
          type: 'video',
          activity: {
            name: submittedName,
            chapter_id: chapterId,
            activity_type: 'TYPE_VIDEO',
            activity_sub_type: 'SUBTYPE_VIDEO_HOSTED',
            details: videoDetails,
          },
          chapterId,
        })
        toast.success(t('successVideoActivityCreated'))
      }

      if (selectedView === 'youtube') {
        const external_video_object: ExternalVideoObject = {
          name: submittedName,
          type: 'youtube',
          uri: submittedYoutubeUrl,
          chapter_id: chapterId,
          details: videoDetails,
        }

        await submitExternalVideo?.(external_video_object, { name: submittedName }, chapterId)
        toast.success(t('successYouTubeVideoActivityCreated'))
      }
    } catch (error) {
      console.error('Error creating video activity:', error)
      toast.error(t('errorFailedToCreateVideoActivity'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fileInputId = `video-activity-file-${useId()}`

  return (
    <div className="mx-auto max-w-2xl">
      <form action={handleSubmit} className="space-y-5">
        {/* Header */}
        <div className="border-b border-gray-100 pb-4">
          <div className="mb-1 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
              <FileVideo size={16} className="text-gray-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{t('createVideoActivity')}</h2>
          </div>
          <p className="ml-[42px] text-sm text-gray-500">{t('createVideoActivityDescription')}</p>
        </div>

        {/* Activity Name */}
        <div className="space-y-1.5">
          <Label htmlFor="video-activity-name" className="text-sm font-medium text-gray-700">
            {t('activityName')} <span className="text-red-400">*</span>
          </Label>
          <Input
            id="video-activity-name"
            name="name"
            value={name}
            onChange={e => {
              setName(e.target.value)
              setErrors(prev => ({ ...prev, name: '' }))
            }}
            type="text"
            required
            placeholder={t('activityNamePlaceholder')}
            className={cn('h-9', errors.name && 'border-red-300 focus-visible:ring-red-200')}
          />
          {errors.name && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1 text-xs text-red-500"
            >
              <AlertCircle size={12} />
              {errors.name}
            </motion.p>
          )}
        </div>

        {/* Video Source */}
        <div className="space-y-3">
          {/* Segmented Control */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setSelectedView('file')
                setErrors(prev => ({ ...prev, youtubeUrl: '' }))
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150',
                selectedView === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Upload size={15} />
              {t('uploadVideo')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedView('youtube')
                setErrors(prev => ({ ...prev, video: '' }))
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150',
                selectedView === 'youtube' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <SiYoutube size={15} />
              {t('youtubeVideo')}
            </button>
          </div>

          {/* Panel Content */}
          <AnimatePresence mode="wait">
            {selectedView === 'file' && (
              <motion.div
                key="file"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-2"
              >
                <input
                  id={fileInputId}
                  name="videoFile"
                  type="file"
                  accept={SUPPORTED_VIDEO_FILES}
                  onChange={handleVideoChange}
                  className="hidden"
                  aria-label={t('ariaLabel')}
                />
                {video ? (
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
                        <FileVideo size={16} className="text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-xs truncate text-sm font-medium text-gray-800">{video.name}</p>
                        <p className="text-xs text-gray-400">{(video.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                    </div>
                    <Label
                      htmlFor={fileInputId}
                      className="cursor-pointer text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
                    >
                      {t('chooseVideoFile')}
                    </Label>
                  </div>
                ) : (
                  <Label
                    htmlFor={fileInputId}
                    className={cn(
                      'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-10 text-center transition-colors hover:border-gray-300 hover:bg-gray-50',
                      errors.video && 'border-red-200 bg-red-50/30',
                    )}
                  >
                    <Upload size={22} className="text-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">{t('chooseVideoFile')}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{t('supportedFormatsAndSize')}</p>
                    </div>
                  </Label>
                )}
                {errors.video && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1 text-xs text-red-500"
                  >
                    <AlertCircle size={12} />
                    {errors.video}
                  </motion.p>
                )}
              </motion.div>
            )}

            {selectedView === 'youtube' && (
              <motion.div
                key="youtube"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-2"
              >
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <SiYoutube size={15} className="text-gray-300" />
                  </div>
                  <Input
                    id="youtube-url"
                    name="youtubeUrl"
                    value={youtubeUrl}
                    onChange={e => {
                      setYoutubeUrl(e.target.value)
                      setErrors(prev => ({ ...prev, youtubeUrl: '' }))
                    }}
                    type="url"
                    required
                    placeholder={t('youtubeUrlPlaceholder')}
                    className={cn(
                      'h-9 pl-9',
                      errors.youtubeUrl
                        ? 'border-red-300 focus-visible:ring-red-200'
                        : youtubeUrl && isYouTubeUrlValid
                          ? 'border-emerald-300 focus-visible:ring-emerald-200'
                          : '',
                    )}
                  />
                  {youtubeUrl && isYouTubeUrlValid && (
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    </div>
                  )}
                </div>
                {errors.youtubeUrl && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1 text-xs text-red-500"
                  >
                    <AlertCircle size={12} />
                    {errors.youtubeUrl}
                  </motion.p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Advanced Settings */}
        <VideoSettingsForm videoDetails={videoDetails} setVideoDetails={setVideoDetails} t={t} />

        {errors.timing && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2"
          >
            <AlertTriangle size={14} className="shrink-0 text-red-400" />
            <p className="text-xs text-red-600">{errors.timing}</p>
          </motion.div>
        )}

        {/* Submit */}
        <div className="flex justify-end border-t border-gray-100 pt-4">
          <Button type="submit" disabled={isSubmitting || !canSubmit} size="sm" className="gap-2 px-5">
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t('creating')}
              </>
            ) : (
              <>
                <Plus size={14} />
                {t('createActivity')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default VideoModal
