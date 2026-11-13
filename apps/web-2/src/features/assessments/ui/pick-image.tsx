import { ImagePlus } from 'lucide-react'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { MediaRef } from '#/shared/api/gen/types.gen'
import { checkUpload, uploadAccept } from '#/shared/api/upload'
import { IconButton } from '#/shared/components/icon-button'
import { SubmitButton } from '#/shared/components/submit-button'
import { UploadProgress } from '#/shared/components/upload-progress'
import { useUpload } from '#/shared/hooks/use-upload'
import { Input } from '#/shared/ui/input'
import { Spinner } from '#/shared/ui/spinner'

const PURPOSE = 'assessment-image'

/** The natural size of a picked picture (the server stores it to reserve the space); null when it does not decode. */
async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

type PickImageProps = {
  label: string
  onPicked: (media: MediaRef) => void
  /** Kept on a replaced picture. */
  alt?: string | undefined
  /** An icon button (the label in its tooltip) instead of a labelled one: a row per option. */
  compact?: boolean
}

/**
 * Picks a picture, reads its natural size and uploads it (`assessment-image`: types and cap from the upload policy);
 * the caller puts the reference into the body, which the server checks on save.
 */
export function PickImage({ label, onPicked, alt, compact = false }: PickImageProps) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUpload(PURPOSE)
  const [problem, setProblem] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [picked, setPicked] = useState<File | null>(null)
  async function pick(file: File) {
    setProblem(null)
    setPicked(file)
    // A file over the cap or of another type: `start` refuses it and says why.
    if (checkUpload(file, PURPOSE)) {
      await upload.start(file)
      return
    }
    setReading(true)
    const size = await imageSize(file)
    setReading(false)
    if (!size) {
      setProblem(m.assessments_media_unreadable())
      return
    }
    const done = await upload.start(file)
    if (done) onPicked({ upload_id: done.id, ...size, ...(alt ? { alt } : {}) })
  }
  const pending = reading || upload.pending
  const error = problem ?? upload.error
  const open = () => input.current?.click()
  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={input}
        type="file"
        accept={uploadAccept(PURPOSE)}
        hidden
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          // Cleared so picking the same file again fires onChange again.
          event.currentTarget.value = ''
          if (file) void pick(file)
        }}
      />
      <div>
        {compact ? (
          <IconButton
            label={label}
            icon={pending ? <Spinner aria-hidden /> : <ImagePlus aria-hidden />}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={open}
          />
        ) : (
          <SubmitButton type="button" variant="outline" size="sm" pending={pending} onClick={open}>
            <ImagePlus data-icon="inline-start" aria-hidden />
            {label}
          </SubmitButton>
        )}
      </div>
      {upload.progress === null ? null : (
        <div className="max-w-sm">
          <UploadProgress progress={upload.progress} file={picked} onCancel={upload.cancel} />
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
