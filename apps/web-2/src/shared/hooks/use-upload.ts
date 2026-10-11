import { useMutation } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

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

type VideoCheck = 'ok' | 'no-picture' | 'unplayable'

/**
 * Whether this browser can open the video at all (a renamed document, a broken file, a codec it lacks): learners
 * would get an empty black frame. 'no-picture': it opens without an image (sound only, or H.265 the browser cannot
 * decode). A file that tells nothing in 10 s passes; the server still checks the rest.
 */
function checkVideo(file: File, signal: AbortSignal): Promise<VideoCheck> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const timeout = AbortSignal.timeout(10_000)
    const done = (answer: VideoCheck) => {
      timeout.removeEventListener('abort', cancel)
      signal.removeEventListener('abort', cancel)
      video.removeEventListener('loadedmetadata', metadata)
      video.removeEventListener('error', error)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(answer)
    }
    const cancel = () => done('ok')
    const metadata = () => done(video.videoWidth > 0 ? 'ok' : 'no-picture')
    const error = () => done('unplayable')
    timeout.addEventListener('abort', cancel, { once: true })
    signal.addEventListener('abort', cancel, { once: true })
    video.preload = 'metadata'
    video.muted = true
    video.addEventListener('loadedmetadata', metadata)
    video.addEventListener('error', error)
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
 * video plays; `notice` warns about one without a picture), uploads and resolves with the finalized upload (or null; `error` then says why). `progress` is
 * 0..1 while uploading; `cancel()` stops it, `retry()` starts the last file again after a failure.
 * `limits`: the narrower rules of the resource the file is for (`UploadLimits`).
 * The file input uses it; the editor calls it for pasted images (`clipboardImage` from `#/shared/api/upload`).
 */
export function useUpload(purpose: UploadPurpose, limits: UploadLimits = {}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [failed, setFailed] = useState<File | null>(null)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const mutation = useMutation({
    mutationFn: ({ file, signal }: { file: File; signal: AbortSignal }) =>
      upload(file, purpose, { onProgress: setProgress, signal }),
    onSettled: () => setProgress(null),
  })
  useLeaveGuard(mutation.isPending || checking)

  async function start(file: File): Promise<FinalizedUpload | null> {
    if (controller.current) return null
    const abort = new AbortController()
    controller.current = abort
    try {
      let issue: string | null = null
      setNotice(null)
      const limit = checkUpload(file, purpose, limits)
      if (limit) issue = problemText(limit)
      else if (purpose === 'block-video') {
        setChecking(true)
        const video = await checkVideo(file, abort.signal)
        setChecking(false)
        if (video === 'unplayable') issue = m.ui_file_unplayable()
        // Allowed (a sound-only lecture is fine), but the teacher should know learners may see a black frame.
        if (video === 'no-picture') setNotice(m.ui_file_no_picture())
      }
      setProblem(issue)
      setFailed(null)
      mutation.reset()
      if (issue) return null
      if (abort.signal.aborted) return null
      setProgress(0)
      try {
        return await mutation.mutateAsync({ file, signal: abort.signal })
      } catch {
        // The mutation keeps the error: `error` below shows it. A cancel is no failure.
        if (abort.signal.aborted) mutation.reset()
        else setFailed(file)
        return null
      }
    } finally {
      controller.current = null
      setChecking(false)
    }
  }

  const error = problem ?? (mutation.error ? presentError(mutation.error) : null)
  return {
    start,
    cancel: () => controller.current?.abort(),
    /** A warning about the file that does not stop the upload (a video without a picture). */
    notice,
    /** The file whose upload failed (a dropped connection...), to start it again; null otherwise. */
    failed,
    progress,
    error,
    pending: mutation.isPending || checking,
  }
}
