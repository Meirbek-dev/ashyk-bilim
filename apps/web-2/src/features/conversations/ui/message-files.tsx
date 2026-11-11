import { useQueryClient } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'

import type { Attachment, MessageId } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { formatFileSize } from '#/shared/i18n/format'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { opensInline } from '../model/attachments'
import { attachmentOptions } from '../queries'

/**
 * A message's files. A name asks for a short-lived signed URL on click (never fetched per row up front: they
 * expire): an image (not SVG) or a PDF opens in a new tab, anything else downloads through a same-origin link and is
 * never rendered on our origin.
 */
export function MessageFiles({ messageId, files }: { messageId: MessageId; files: readonly Attachment[] }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  if (files.length === 0) return null
  async function open(file: Attachment) {
    const inline = opensInline(file.mime)
    // Opened in the click itself: Safari blocks a window.open that comes after an await as a pop-up.
    const tab = inline ? window.open('', '_blank') : null
    try {
      const signed = await queryClient.query({
        ...attachmentOptions(messageId, file.upload_id, inline),
        staleTime: 0,
      })
      setError(null)
      if (tab) {
        tab.opener = null
        tab.location.href = signed.path
      } else if (inline) window.open(signed.path, '_blank', 'noopener')
      else Object.assign(document.createElement('a'), { href: signed.path, download: file.name }).click()
    } catch (failed) {
      tab?.close()
      setError(failed)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {files.map(file => (
          <li key={file.upload_id} className="flex min-w-0 items-center gap-2">
            <Button
              variant="link"
              className="h-auto min-w-0 justify-start px-0! py-0.5"
              onClick={() => void open(file)}
            >
              <Paperclip data-icon="inline-start" aria-hidden />
              <span className="truncate">{file.name}</span>
            </Button>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatFileSize(file.size_bytes)}
            </span>
          </li>
        ))}
      </ul>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
    </div>
  )
}
