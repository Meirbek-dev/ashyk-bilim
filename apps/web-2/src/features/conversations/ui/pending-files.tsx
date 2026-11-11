import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Progress, ProgressValue } from '#/shared/components/progress'
import { formatFileSize } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'

import { isUploading, type PendingFile } from '../model/attachments'

type PendingFilesProps = {
  files: readonly PendingFile[]
  onRemove: (key: string) => void
  onRetry: (key: string) => void
}

/** The files picked for the next message, under the box: name and size, the upload's bar, «Убрать», a failure. */
export function PendingFiles({ files, onRemove, onRetry }: PendingFilesProps) {
  if (files.length === 0) return null
  return (
    <ul aria-label={m.conversations_files_label()} className="flex flex-col divide-y border-y">
      {files.map(f => (
        <li key={f.key} className="flex min-h-row min-w-0 flex-col justify-center gap-1 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFileSize(f.file.size)}</span>
            <IconButton
              label={m.conversations_remove_file({ name: f.file.name })}
              icon={<X aria-hidden />}
              onClick={() => onRemove(f.key)}
            />
          </div>
          {isUploading(f) ? (
            <Progress value={Math.round(f.progress * 100)} aria-label={m.ui_file_uploading()}>
              <ProgressValue />
            </Progress>
          ) : null}
          {f.error ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              {f.error}
              <Button variant="outline" size="sm" onClick={() => onRetry(f.key)}>
                {m.ui_retry()}
              </Button>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
