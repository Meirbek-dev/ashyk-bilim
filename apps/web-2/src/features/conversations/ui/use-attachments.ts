import { useEffect, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { checkUpload, upload } from '#/shared/api/upload'
import { useSessionHold } from '#/shared/hooks/use-upload'
import { presentError } from '#/shared/i18n/errors'
import { formatFileSize } from '#/shared/i18n/format'

import { fitting, isUploading, type PendingFile } from '../model/attachments'

const PURPOSE = 'message-attachment'

/** Why the file cannot go (empty, over 20 MB), before any request; null when it can. */
function problemOf(file: File): string | null {
  const problem = checkUpload(file, PURPOSE)
  if (!problem) return null
  if (problem.kind === 'empty') return m.ui_file_empty()
  if (problem.kind === 'too-large') return m.ui_file_too_large({ size: formatFileSize(problem.maxBytes) })
  return m.ui_file_wrong_type()
}

/**
 * The files of the next message (docs/DIALOGS.md 12): each uploads at once, side by side, through
 * `shared/api/upload.ts`; a row can be removed (a running upload is cancelled) or, after a failure, tried again. The
 * session is held while anything uploads, so a 401 keeps the page with its files. `clear()` after a send.
 */
export function useAttachments() {
  const [files, setFiles] = useState<PendingFile[]>([])
  const running = useRef(new Map<string, AbortController>())
  const session = useSessionHold()
  useEffect(() => {
    const controllers = running.current
    return () => {
      for (const controller of controllers.values()) controller.abort()
    }
  }, [])
  const busy = files.some(isUploading)
  useEffect(() => {
    if (busy) session.hold()
    else session.release()
  }, [busy, session])

  const patch = (key: string, change: Partial<PendingFile>) =>
    setFiles(list => list.map(f => (f.key === key ? { ...f, ...change } : f)))
  const run = (key: string, file: File) => {
    const abort = new AbortController()
    running.current.set(key, abort)
    upload(file, PURPOSE, { signal: abort.signal, onProgress: progress => patch(key, { progress }) })
      .then(done => patch(key, { upload: done, progress: 1 }))
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) patch(key, { error: presentError(failure) })
      })
      .finally(() => running.current.delete(key))
  }

  return {
    files,
    add: (picked: File[]) => {
      const next = fitting(picked, files.length).map(file => ({
        key: crypto.randomUUID(),
        file,
        progress: 0,
        upload: null,
        error: problemOf(file),
      }))
      setFiles(list => [...list, ...next])
      for (const f of next) if (!f.error) run(f.key, f.file)
    },
    remove: (key: string) => {
      running.current.get(key)?.abort()
      setFiles(list => list.filter(f => f.key !== key))
    },
    retry: (key: string) => {
      const pending = files.find(f => f.key === key)
      if (!pending || problemOf(pending.file)) return
      patch(key, { error: null, progress: 0 })
      run(key, pending.file)
    },
    clear: () => setFiles([]),
  }
}
