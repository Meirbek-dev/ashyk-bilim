import { useQueryClient } from '@tanstack/react-query'
import { Download, X } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AttachedFile } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { IconButton } from '#/shared/components/icon-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { downloadOptions } from '../queries'

type AttemptFilesProps = {
  files: AttachedFile[]
  /** Present while the files can change (an open attempt): each row gets "Remove". */
  onRemove?: ((uploadId: string) => void) | undefined
  disabled?: boolean
}

/**
 * The attempt's own files. A name is a button that asks for a short-lived signed URL and opens it in a new tab
 * (B-FSB-10): the URLs expire, so they are not fetched for every row up front.
 */
export function AttemptFiles({ files, onRemove, disabled = false }: AttemptFilesProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  async function open(file: AttachedFile) {
    try {
      const signed = await queryClient.fetchQuery(downloadOptions(file.id))
      setError(null)
      window.open(signed.url, '_blank', 'noopener')
    } catch (failed) {
      setError(failed)
    }
  }
  if (files.length === 0) return <p className="text-sm text-muted-foreground">{m.submission_no_files()}</p>
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-lg border">
        {files.map(file => (
          <li key={file.id} className="flex min-h-row min-w-0 items-center gap-2 px-2">
            <Button variant="ghost" className="min-w-0 flex-1 justify-start" onClick={() => void open(file)}>
              <Download data-icon="inline-start" aria-hidden />
              <span className="truncate">{file.filename}</span>
            </Button>
            {onRemove ? (
              <IconButton
                label={m.submission_remove_file({ name: file.filename })}
                icon={<X aria-hidden />}
                disabled={disabled}
                onClick={() => onRemove(file.upload_id)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
    </div>
  )
}
