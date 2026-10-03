import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AttachedFile } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { IconButton } from '#/shared/components/icon-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { downloadOptions } from '../queries'

/**
 * The attempt's files (B-GRD-16). A name asks for a short-lived signed URL and opens it in a new tab; an image can be
 * shown here. The URLs expire, so they are asked for on click, not for every row up front.
 */
export function FilesList({ files }: { files: readonly AttachedFile[] }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [shown, setShown] = useState<{ name: string; url: string } | null>(null)
  async function signed(file: AttachedFile) {
    try {
      const answer = await queryClient.fetchQuery(downloadOptions(file.id))
      setError(null)
      return answer.url
    } catch (failed) {
      setError(failed)
      return null
    }
  }
  if (files.length === 0) return <p className="text-sm text-muted-foreground">{m.grading_no_files()}</p>
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-lg border">
        {files.map(file => (
          <li key={file.id} className="flex min-h-row min-w-0 items-center gap-2 px-2">
            <Button
              variant="ghost"
              className="min-w-0 flex-1 justify-start"
              aria-label={m.grading_download({ name: file.filename })}
              onClick={() => void signed(file).then(url => url && window.open(url, '_blank', 'noopener'))}
            >
              <Download data-icon="inline-start" aria-hidden />
              <span className="truncate">{file.filename}</span>
            </Button>
            {file.content_type.startsWith('image/') ? (
              <IconButton
                label={m.grading_preview({ name: file.filename })}
                icon={<Eye aria-hidden />}
                onClick={() => void signed(file).then(url => url && setShown({ name: file.filename, url }))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      {shown ? <img src={shown.url} alt={shown.name} className="max-w-full rounded-lg border" /> : null}
    </div>
  )
}
