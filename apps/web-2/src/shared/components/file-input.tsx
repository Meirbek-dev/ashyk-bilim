import { useEffect, useId, useRef, useState, type DragEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { FinalizedUpload } from '#/shared/api/gen/types.gen'
import { uploadAccept, type UploadLimits, type UploadPurpose } from '#/shared/api/upload'
import { useUpload } from '#/shared/hooks/use-upload'
import { cn } from '#/shared/lib/utils'
import { buttonVariants } from '#/shared/ui/button'
import { Input } from '#/shared/ui/input'
import { Progress } from '#/shared/ui/progress'

type FileInputProps = {
  label: string
  /** What fits (types, size): shown under the drop zone. */
  description?: string | undefined
  /** Accepted types and the size cap come from the purpose's upload policy (`shared/api/upload.ts`). */
  purpose: UploadPurpose
  /** Narrower rules of the resource (a task's types and size) on top of the purpose's. */
  limits?: UploadLimits | undefined
  /** The finalized upload: its `id` is what the resource claims (`thumbnail_upload_id`...). */
  onUploaded: (upload: FinalizedUpload, file: File) => void
  /** A file handed over from outside (pasted or dropped onto an editor): uploaded once, on mount. */
  file?: File | undefined
  /** An error from outside (the form field's), shown when the upload itself has none. */
  error?: string | undefined
  disabled?: boolean
}

/** Uploads a file handed over at mount once (a ref: effects may run twice under StrictMode). */
function useHandedFile(file: File | undefined, take: (file: File) => Promise<void>) {
  const queued = useRef(file)
  useEffect(() => {
    const next = queued.current
    queued.current = undefined
    if (next) void take(next)
  })
}

/**
 * Pick or drop one file; it uploads at once (create -> PUT -> finalize) with progress, and limit or API errors
 * show under the zone. The native input stays the one focusable control; the visible button is its label.
 */
export function FileInput(props: FileInputProps) {
  const { label, description, purpose, limits = {}, onUploaded, file, error, disabled = false } = props
  const id = useId()
  const { start, progress, error: uploadError, pending } = useUpload(purpose, limits)
  const [dragging, setDragging] = useState(false)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const shownError = uploadError ?? error
  const inactive = disabled || pending

  async function take(picked: File | undefined) {
    if (!picked || inactive) return
    const done = await start(picked)
    setUploaded(done ? picked.name : null)
    if (done) onUploaded(done, picked)
  }
  useHandedFile(file, take)
  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void take(event.dataTransfer.files[0])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium">
        {label}
      </span>
      <div
        data-dragging={dragging || undefined}
        onDragOver={event => {
          event.preventDefault()
          setDragging(!inactive)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className="relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground transition-colors duration-150 data-dragging:border-ring data-dragging:bg-accent"
      >
        <Input
          id={id}
          type="file"
          accept={uploadAccept(purpose, limits)}
          disabled={inactive}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-status`}
          aria-invalid={shownError ? true : undefined}
          onChange={event => {
            void take(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }}
          className="peer sr-only"
        />
        <label
          htmlFor={id}
          aria-disabled={inactive || undefined}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
          )}
        >
          {m.ui_file_choose()}
        </label>
        <span>{m.ui_file_drop()}</span>
      </div>
      {progress === null ? null : <Progress value={Math.round(progress * 100)} aria-label={m.ui_file_uploading()} />}
      <div id={`${id}-status`} aria-live="polite" className="flex flex-col gap-1 text-sm">
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        {uploaded && !shownError ? <p>{m.ui_file_uploaded({ name: uploaded })}</p> : null}
        {shownError ? <p className="text-destructive">{shownError}</p> : null}
      </div>
    </div>
  )
}
