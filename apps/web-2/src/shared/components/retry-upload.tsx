import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

export function RetryUpload({
  file,
  disabled,
  retry,
}: {
  file: File
  disabled: boolean
  retry: (file: File) => Promise<void>
}) {
  return (
    <Button variant="outline" size="sm" disabled={disabled} className="self-start" onClick={() => void retry(file)}>
      {m.ui_file_retry()}
    </Button>
  )
}
