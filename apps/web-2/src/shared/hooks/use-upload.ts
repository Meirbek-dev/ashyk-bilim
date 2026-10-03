import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { FinalizedUpload } from '#/shared/api/gen/types.gen'
import { checkUpload, upload, type UploadProblem, type UploadPurpose } from '#/shared/api/upload'
import { presentError } from '#/shared/i18n/errors'

const MB = 1024 * 1024

const problemText = (problem: UploadProblem): string =>
  problem.kind === 'too-large' ? m.ui_file_too_large({ mb: problem.maxBytes / MB }) : m.ui_file_wrong_type()

/**
 * One file through `shared/api/upload.ts` with its state: `start(file)` checks the purpose's limits, uploads and
 * resolves with the finalized upload (or null; `error` then says why). `progress` is 0..1 while uploading.
 * The file input uses it; the editor calls it for pasted images (`clipboardImage` from `#/shared/api/upload`).
 */
export function useUpload(purpose: UploadPurpose) {
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (file: File) => upload(file, purpose, { onProgress: setProgress }),
    onSettled: () => setProgress(null),
  })

  async function start(file: File): Promise<FinalizedUpload | null> {
    const issue = checkUpload(file, purpose)
    setProblem(issue ? problemText(issue) : null)
    mutation.reset()
    if (issue) return null
    setProgress(0)
    try {
      return await mutation.mutateAsync(file)
    } catch {
      // The mutation keeps the error: `error` below shows it.
      return null
    }
  }

  const error = problem ?? (mutation.error ? presentError(mutation.error) : null)
  return { start, progress, error, pending: mutation.isPending }
}
