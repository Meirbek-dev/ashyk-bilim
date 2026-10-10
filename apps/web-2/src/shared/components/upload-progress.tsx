import { m } from '#/paraglide/messages'
import { formatFileSize } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { Progress, ProgressValue } from '#/shared/ui/progress'

/** The running upload: a bar with "12 MB of 450 MB" and the percent, and its cancel button. */
export function UploadProgress({
  progress,
  file,
  onCancel,
}: {
  progress: number
  file: File | null
  onCancel: () => void
}) {
  return (
    <div className="flex items-end gap-3">
      <Progress value={Math.round(progress * 100)} aria-label={m.ui_file_uploading()} className="flex-1">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {file
            ? m.ui_file_progress({ done: formatFileSize(progress * file.size), total: formatFileSize(file.size) })
            : null}
        </span>
        <ProgressValue />
      </Progress>
      <Button variant="outline" size="sm" onClick={onCancel}>
        {m.ui_file_cancel()}
      </Button>
    </div>
  )
}
