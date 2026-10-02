'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field'
import AppLink from '@/components/ui/AppLink'
import { VideoSettingsForm } from '@/components/Objects/Modals/Activities/Create/NewActivityModal/components/VideoSettingsForm'
import { useApiError } from '@/hooks/useApiError'
import { updateActivity } from '@services/courses/activities'
import { replaceActivityFile } from '@services/courses/activity-uploads'
import { UPLOAD_MAX_BYTES, uploadMaxMb } from '@services/media/uploads'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import VideoActivity from '@components/Objects/Activities/Video/Video'
import DocumentPdfActivity from '@components/Objects/Activities/DocumentPdf/DocumentPdf'

const YOUTUBE_URL = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/

interface VideoDetails {
  startTime: number
  endTime: number | null
  autoplay: boolean
  muted: boolean
  [key: string]: unknown
}

/** Video / PDF activities: change the source (YouTube link or file) and the player settings after creation. */
export default function MediaActivityStudio({
  activity: initial,
  courseUuid,
}: {
  activity: AppActivity
  courseUuid: string
}) {
  const t = useTranslations('Features.MediaStudio')
  const tVideo = useTranslations('Components.VideoModal')
  const { toastApiError } = useApiError()
  const fileInput = useRef<HTMLInputElement>(null)
  const [activity, setActivity] = useState(initial)
  const isVideo = activity.activity_type === 'TYPE_VIDEO'
  const isYouTube = activity.activity_sub_type === 'SUBTYPE_VIDEO_YOUTUBE'
  const content = (activity.content ?? {}) as { uri?: string; file_name?: string; filename?: string }
  const [url, setUrl] = useState(content.uri ?? '')
  const [details, setDetails] = useState<VideoDetails>(() => ({
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
    ...(activity.details as Partial<VideoDetails> | null),
  }))
  const [saved, setSaved] = useState(() => JSON.stringify({ url, details }))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const urlInvalid = isYouTube && !YOUTUBE_URL.test(url.trim())
  const dirty = JSON.stringify({ url, details }) !== saved
  const purpose = isVideo ? 'block-video' : 'block-pdf'
  const learnerHref = `/course/${stripEntityPrefix(courseUuid)}/activity/${stripEntityPrefix(activity.activity_uuid)}`

  const save = async () => {
    setBusy(true)
    try {
      const nextContent = isYouTube ? { uri: url.trim(), type: 'youtube' } : undefined
      const updated = await updateActivity(
        { version: activity.version, details, ...(nextContent ? { content: nextContent } : {}) },
        activity.activity_uuid,
      )
      setActivity(prev => ({ ...prev, version: updated.version, details, content: nextContent ?? prev.content }))
      setSaved(JSON.stringify({ url, details }))
      toast.success(t('saved'))
    } catch (error) {
      toastApiError(error)
    } finally {
      setBusy(false)
    }
  }

  const replace = async (file: File) => {
    if (file.size > UPLOAD_MAX_BYTES[purpose]) {
      toast.error(t('fileTooLarge', { size: uploadMaxMb(purpose) }))
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      const updated = await replaceActivityFile(activity, file, isVideo ? 'video' : 'documentpdf', p =>
        setProgress(p.percentage),
      )
      setActivity(prev => ({ ...prev, version: updated.version, content: updated.content }))
      toast.success(t('saved'))
    } catch (error) {
      toastApiError(error)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight wrap-anywhere">{activity.name}</h1>
      <section className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{t('source')}</h2>
        {isYouTube ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="media-studio-url">{t('youtubeUrl')}</Label>
            <Input
              id="media-studio-url"
              value={url}
              onChange={event => setUrl(event.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              aria-invalid={urlInvalid}
            />
            {urlInvalid ? <FieldError>{tVideo('errorValidYouTubeUrl')}</FieldError> : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="text-muted-foreground">{t('currentFile')}: </span>
              {content.file_name ?? content.filename ?? '—'}
            </p>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={isVideo ? 'video/mp4,video/webm,video/x-matroska' : 'application/pdf'}
              onChange={event => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void replace(file)
              }}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
              {progress === null ? <Upload /> : <Loader2 className="animate-spin" />}
              {progress === null ? t('replaceFile') : t('uploading', { percent: Math.round(progress) })}
            </Button>
          </div>
        )}
      </section>

      {isVideo ? <VideoSettingsForm videoDetails={details} setVideoDetails={setDetails} t={tVideo} /> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {activity.published ? (
          <Button variant="outline" nativeButton={false} render={<AppLink href={learnerHref} />}>
            <Eye />
            {t('openLearnerView')}
          </Button>
        ) : null}
        {isVideo ? (
          <Button type="button" disabled={busy || urlInvalid || !dirty} onClick={() => void save()}>
            {busy && progress === null ? <Loader2 className="animate-spin" /> : null}
            {t('save')}
          </Button>
        ) : null}
      </div>
      {/* What the learner gets (drafts cannot open on the learner page). */}
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{t('preview')}</h2>
        {isVideo ? (
          urlInvalid ? null : (
            <VideoActivity
              key={JSON.stringify({ url, details, file: content.filename })}
              activity={{
                activity_sub_type: activity.activity_sub_type ?? '',
                activity_uuid: activity.activity_uuid,
                content: isYouTube ? { uri: url.trim() } : { filename: content.filename ?? '' },
                details,
              }}
              course={{ course_uuid: courseUuid }}
            />
          )
        ) : (
          <div className="h-[70vh] overflow-hidden rounded-lg border">
            <DocumentPdfActivity activity={activity} course={{ course_uuid: courseUuid }} />
          </div>
        )}
      </section>
    </div>
  )
}
