import { useEffect, useId, useRef, useState, type DragEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { FinalizedUpload } from '#/shared/api/gen/types.gen'
import { uploadAccept, type UploadLimits, type UploadPurpose } from '#/shared/api/upload'
import { isSessionLost } from '#/shared/api/errors'
import { useSessionHold, useUpload } from '#/shared/hooks/use-upload'
import { cn } from '#/shared/lib/utils'
import { presentError } from '#/shared/i18n/errors'
import { buttonVariants } from './button-variants'
import { Input } from '#/shared/ui/input'

import { UploadProgress } from './upload-progress'
import { RetryUpload } from './retry-upload'

type FileInputProps = {
  label: string
  /** What fits (types, size): shown under the drop zone. */
  description?: string | undefined
  /** Accepted types and the size cap come from the purpose's upload policy (`shared/api/upload.ts`). */
  purpose: UploadPurpose
  /** Narrower rules of the resource (a task's types and size) on top of the purpose's. */
  limits?: UploadLimits | undefined
  /**
   * The finalized upload: its `id` is what the resource claims (`thumbnail_upload_id`...). With `multiple`, called per
   * file in turn; a returned promise (the claim) is awaited before the next file is handed over.
   */
  onUploaded: (upload: FinalizedUpload, file: File) => void | Promise<unknown>
  /** How many files one pick may take (a file task's free slots); more than 1 makes the picker take several. */
  multiple?: number | undefined
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
 * Picked files upload one after another (one progress bar), each handed over in turn; the first refusal stops the rest.
 * A claim refused because the session ended keeps the page (the session hold) until its retry.
 */
function useBatch(
  start: (file: File) => Promise<FinalizedUpload | null>,
  onUploaded: FileInputProps['onUploaded'],
  max: number,
) {
  const [uploaded, setUploaded] = useState<string[]>([])
  const [picked, setPicked] = useState<File | null>(null)
  const [dropped, setDropped] = useState(0)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimFailed, setClaimFailed] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const active = useRef(false)
  const finalized = useRef<{ file: File; upload: FinalizedUpload } | null>(null)
  const session = useSessionHold()
  async function one(next: File) {
    setPicked(next)
    setClaimError(null)
    setClaimFailed(null)
    const done = finalized.current?.file === next ? finalized.current.upload : await start(next)
    if (!done) return false
    finalized.current = { file: next, upload: done }
    session.hold()
    try {
      await onUploaded(done, next)
    } catch (error) {
      setClaimError(presentError(error))
      setClaimFailed(next)
      if (!isSessionLost(error)) session.release()
      return false
    }
    finalized.current = null
    session.release()
    setUploaded(names => [...names, next.name])
    return true
  }
  async function take(files: File[]) {
    if (active.current) return
    active.current = true
    setPending(true)
    try {
      const batch = files.slice(0, Math.max(max, 0))
      setDropped(files.length - batch.length)
      setUploaded([])
      finalized.current = null
      session.release()
      for (const next of batch) if (!(await one(next))) return
    } finally {
      active.current = false
      setPending(false)
    }
  }
  async function retry(file: File) {
    if (active.current) return
    active.current = true
    setPending(true)
    try {
      await one(file)
    } finally {
      active.current = false
      setPending(false)
    }
  }
  return { uploaded, picked, dropped, take, retry, pending, claimError, claimFailed }
}

/**
 * Pick or drop one file (or, with `multiple`, several: one after another); it uploads at once (create -> PUT ->
 * finalize) with progress, and limit or API errors show under the zone. The native input stays the one focusable
 * control; the visible button is its label, and its words are in the input's name (speech users say what they see).
 */
export function FileInput(props: FileInputProps) {
  const { label, description, purpose, limits = {}, onUploaded, file, error, disabled = false, multiple = 1 } = props
  const id = useId()
  const upload = useUpload(purpose, limits)
  const { cancel, failed, notice, progress, error: uploadError, sessionLost: lost } = upload
  const batch = useBatch(upload.start, onUploaded, multiple)
  const { uploaded, picked, dropped, pending } = batch
  const again = batch.claimFailed ?? failed
  const [dragging, setDragging] = useState(false)
  // With several files the error names the one it is about.
  const ownError = batch.claimError ?? uploadError
  const shownError = ownError && multiple > 1 && picked ? `${picked.name}: ${ownError}` : (ownError ?? error)
  const inactive = disabled || pending || upload.pending || multiple < 1
  const take = async (files: File[]) => {
    if (files.length > 0 && !inactive) await batch.take(files)
  }
  useHandedFile(file, next => take([next]))
  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void take([...event.dataTransfer.files])
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
          multiple={multiple > 1}
          accept={uploadAccept(purpose, limits)}
          disabled={inactive}
          aria-labelledby={`${id}-label ${id}-choose`}
          aria-describedby={`${id}-status`}
          aria-invalid={shownError ? true : undefined}
          onChange={event => {
            void take([...(event.currentTarget.files ?? [])])
            event.currentTarget.value = ''
          }}
          className="peer sr-only"
        />
        <label
          id={`${id}-choose`}
          htmlFor={id}
          aria-disabled={inactive || undefined}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
          )}
        >
          {multiple > 1 ? m.ui_files_choose() : m.ui_file_choose()}
        </label>
        <span>{multiple > 1 ? m.ui_files_drop() : m.ui_file_drop()}</span>
      </div>
      {progress === null ? null : <UploadProgress progress={progress} file={picked} onCancel={cancel} />}
      <div id={`${id}-status`} aria-live="polite" className="flex flex-col gap-1 text-sm">
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        {pending && progress === null ? <p className="text-muted-foreground">{m.ui_file_checking()}</p> : null}
        {uploaded.length > 0 && !shownError ? <p>{m.ui_file_uploaded({ name: uploaded.join(', ') })}</p> : null}
        {dropped > 0 ? <p className="text-warning">{m.ui_files_over({ count: dropped })}</p> : null}
        {notice && !shownError ? <p className="text-warning">{notice}</p> : null}
        {shownError ? <p className="text-destructive">{shownError}</p> : null}
      </div>
      {again && !pending ? <RetryUpload file={again} disabled={disabled} retry={batch.retry} signIn={lost} /> : null}
    </div>
  )
}
