import { ArrowBigUpDash, Trash2, UploadCloud } from 'lucide-react'
import { useCoursesMutations } from '@/hooks/mutations/useCoursesMutations'
import { useSaveSection } from '@/hooks/useSaveSection'
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert'

import { getCourseThumbnailUrl } from '@services/media/media'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCourse } from '@components/Contexts/CourseContext'
import { Button } from '@components/ui/button'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { toast } from 'sonner'
import type React from 'react'
import { compressImage } from '@/lib/image-compression'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // the server's `course-thumbnail` upload policy
const REQUIRED_IMAGE_ASPECT_RATIO = 16 / 9
const IMAGE_ASPECT_RATIO_TOLERANCE = 0.01
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const

type ValidImageMimeType = (typeof VALID_IMAGE_MIME_TYPES)[number]

interface ThumbnailUpdateProps {
  disabled?: boolean
  disabledReason?: string
}

/**
 * Course thumbnail (image only — v2 carries a single `thumbnail_key`).
 * The file travels the upload pipeline (`uploadFile` → presigned PUT → finalize)
 * and the finalized upload is claimed by `PATCH /courses/{id}`.
 */
function ThumbnailUpdate({ disabled = false, disabledReason }: ThumbnailUpdateProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)

  const course = useCourse()
  const { updateThumbnail } = useCoursesMutations(course.courseStructure.course_uuid, true)
  const t = useTranslations('CourseEdit.General.Thumbnail')

  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const { isSaving, saveWithoutRefresh } = useSaveSection({
    section: 'general',
    errorMessage: t('errors.updateFailed'),
  })

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl)
    }
  }, [localUrl])

  const showError = useCallback((message: string) => {
    toast.error(message, { duration: 3000, position: 'top-center' })
  }, [])

  const validateFile = useCallback(
    (file: File): boolean => {
      if (!VALID_IMAGE_MIME_TYPES.includes(file.type as ValidImageMimeType)) {
        showError(t('errors.invalidMimeType', { fileType: file.type }))
        return false
      }
      if (file.size > MAX_FILE_SIZE) {
        showError(t('errors.fileTooLarge', { fileSize: (file.size / 1024 / 1024).toFixed(2) }))
        return false
      }
      return true
    },
    [showError, t],
  )

  const validateImageAspectRatio = useCallback(
    async (blobUrl: string): Promise<boolean> => {
      try {
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const image = new globalThis.Image()
          image.addEventListener('load', () => resolve({ width: image.naturalWidth, height: image.naturalHeight }))
          image.addEventListener('error', () => reject(new Error('Failed to read image dimensions')))
          image.src = blobUrl
        })
        const actualAspectRatio = dimensions.width / dimensions.height
        if (Math.abs(actualAspectRatio - REQUIRED_IMAGE_ASPECT_RATIO) > IMAGE_ASPECT_RATIO_TOLERANCE) {
          showError(t('errors.invalidAspectRatio', { height: dimensions.height, width: dimensions.width }))
          return false
        }
        return true
      } catch {
        showError(t('errors.imageReadFailed'))
        return false
      }
    },
    [showError, t],
  )

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) {
        showError(t('errors.pleaseSelectAFile'))
        return
      }

      let fileToUse = file
      try {
        fileToUse = await compressImage(file, { maxWidth: 1200, maxHeight: 675, quality: 0.8 })
      } catch (error) {
        console.error('Image compression failed, using original file', error)
      }

      if (!validateFile(fileToUse)) return

      const blobUrl = URL.createObjectURL(fileToUse)
      if (!(await validateImageAspectRatio(blobUrl))) {
        URL.revokeObjectURL(blobUrl)
        return
      }

      setLocalUrl(blobUrl)
      await saveWithoutRefresh(async () => updateThumbnail(fileToUse), {
        onSuccess: () => setLocalUrl(null),
        successMessage: t('thumbnailUpdatedSuccessfully'),
      })
    },
    [showError, validateFile, validateImageAspectRatio, saveWithoutRefresh, updateThumbnail, t],
  )

  const handleRemove = useCallback(async () => {
    await saveWithoutRefresh(async () => updateThumbnail(null), {
      successMessage: t('thumbnailRemoved'),
    })
  }, [saveWithoutRefresh, updateThumbnail, t])

  const previewUrl = localUrl ?? getCourseThumbnailUrl(course.courseStructure.thumbnail_image)

  return (
    <div className="bg-card flex w-full flex-col gap-6 rounded-lg border p-6">
      <div className="mx-auto max-w-[480px]">
        <Image
          src={previewUrl}
          alt={localUrl ? t('thumbnailPreviewAlt') : t('currentThumbnailAlt')}
          className={`border-border aspect-video w-full rounded-lg border object-cover shadow-sm ${
            isSaving ? 'animate-pulse' : ''
          }`}
          width={480}
          height={270}
          unoptimized
        />
      </div>

      {isSaving ? (
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground bg-muted flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium">
            <ArrowBigUpDash className="h-4 w-4 animate-bounce" />
            {t('uploading')}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            ref={imageInputRef}
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            aria-label={t('ariaLabelImage')}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={disabled}
            onClick={() => imageInputRef.current?.click()}
            className="flex-1"
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            {t('uploadImageButton')}
          </Button>
          {course.courseStructure.thumbnail_image ? (
            <Button type="button" variant="outline" size="default" disabled={disabled} onClick={handleRemove}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('removeImageButton')}
            </Button>
          ) : null}
        </div>
      )}

      <p className="text-muted-foreground text-center text-xs">{t('supportedFormats')}</p>
      {disabledReason ? (
        <Alert className="border-border bg-muted/60">
          <AlertTitle>{t('uploadImageButton')}</AlertTitle>
          <AlertDescription>{disabledReason}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

export default ThumbnailUpdate
