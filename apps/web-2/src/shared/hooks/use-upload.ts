import { useMutation } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { FinalizedUpload } from '#/shared/api/gen/types.gen'
import { checkUpload, upload, type UploadLimits, type UploadProblem, type UploadPurpose } from '#/shared/api/upload'
import { formatFileSize } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'

const problemText = (problem: UploadProblem): string => {
  if (problem.kind === 'empty') return m.ui_file_empty()
  if (problem.kind === 'too-large') return m.ui_file_too_large({ size: formatFileSize(problem.maxBytes) })
  return m.ui_file_wrong_type()
}

/**
 * Whether this browser can open the video at all (a renamed document, a broken file, a codec it lacks): learners
 * would get an empty black frame. A file that tells nothing in 10 s passes; the server still checks the rest.
 */
function playable(file: File): Promise<boolean> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const timeout = AbortSignal.timeout(10_000)
    const done = (answer: boolean) => {
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(answer)
    }
    timeout.addEventListener('abort', () => done(true), { once: true })
    video.preload = 'metadata'
    video.muted = true
    video.addEventListener('loadedmetadata', () => done(true), { once: true })
    video.addEventListener('error', () => done(false), { once: true })
    video.src = url
  })
}

/** Leaving the page (a link, a reload, closing the tab) drops a running upload: ask first. */
function useLeaveGuard(active: boolean) {
  useBlocker({
    disabled: !active,
    enableBeforeUnload: active,
    shouldBlockFn: () => !window.confirm(m.ui_file_leave()),
  })
}

/**
 * One file through `shared/api/upload.ts` with its state: `start(file)` checks the purpose's limits (and that a
 * video plays), uploads and resolves with the finalized upload (or null; `error` then says why). `progress` is
 * 0..1 while uploading; `cancel()` stops it, `retry()` starts the last file again after a failure.
 * `limits`: the narrower rules of the resource the file is for (`UploadLimits`).
 * The file input uses it; the editor calls it for pasted images (`clipboardImage` from `#/shared/api/upload`).
 */
export function useUpload(purpose: UploadPurpose, limits: UploadLimits = {}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [failed, setFailed] = useState<File | null>(null)
  const [checking, setChecking] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const mutation = useMutation({
    mutationFn: ({ file, signal }: { file: File; signal: AbortSignal }) =>
      upload(file, purpose, { onProgress: setProgress, signal }),
    onSettled: () => setProgress(null),
  })
  useLeaveGuard(mutation.isPending)

  async function start(file: File): Promise<FinalizedUpload | null> {
    let issue: string | null = null
    const limit = checkUpload(file, purpose, limits)
    if (limit) issue = problemText(limit)
    else if (purpose === 'block-video') {
      setChecking(true)
      if (!(await playable(file))) issue = m.ui_file_unplayable()
      setChecking(false)
    }
    setProblem(issue)
    setFailed(null)
    mutation.reset()
    if (issue) return null
    setProgress(0)
    const abort = new AbortController()
    controller.current = abort
    try {
      return await mutation.mutateAsync({ file, signal: abort.signal })
    } catch {
      // The mutation keeps the error: `error` below shows it. A cancel is no failure.
      if (abort.signal.aborted) mutation.reset()
      else setFailed(file)
      return null
    }
  }

  const error = problem ?? (mutation.error ? presentError(mutation.error) : null)
  return {
    start,
    cancel: () => controller.current?.abort(),
    /** The file whose upload failed (a dropped connection...), to start it again; null otherwise. */
    failed,
    progress,
    error,
    pending: mutation.isPending || checking,
  }
}
