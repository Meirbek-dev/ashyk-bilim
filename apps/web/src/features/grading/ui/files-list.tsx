import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AttachedFile, Disposition } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { IconButton } from '#/shared/components/icon-button'
import { PdfFrame } from '#/shared/components/pdf-frame'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import { showsInline } from '../model/grade-form'
import { downloadOptions } from '../queries'

/** A same-origin `download` link saves the file whatever its headers say: it is never rendered here. */
const save = (path: string) => Object.assign(document.createElement('a'), { href: path, download: '' }).click()

/**
 * The attempt's files (B-GRD-16). A name asks for a short-lived signed path on our origin and downloads the file;
 * an image (not SVG) or a PDF can be shown here (`disposition=inline`, `showsInline`, B-GRD-28). The paths expire,
 * so they are asked for on click.
 */
export function FilesList({ files }: { files: readonly AttachedFile[] }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [shown, setShown] = useState<{ name: string; path: string; pdf: boolean } | null>(null)
  async function signed(file: AttachedFile, disposition?: Disposition) {
    try {
      const answer = await queryClient.fetchQuery(downloadOptions(file.id, disposition))
      setError(null)
      return answer.path
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
              onClick={() => void signed(file).then(path => path && save(path))}
            >
              <Download data-icon="inline-start" aria-hidden />
              <span className="truncate">{file.filename}</span>
            </Button>
            {showsInline(file.content_type) ? (
              <IconButton
                label={m.grading_preview({ name: file.filename })}
                icon={<Eye aria-hidden />}
                onClick={() =>
                  void signed(file, 'inline').then(
                    path =>
                      path && setShown({ name: file.filename, path, pdf: file.content_type === 'application/pdf' }),
                  )
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      {shown?.pdf ? <PdfFrame src={shown.path} title={shown.name} /> : null}
      {shown && !shown.pdf ? <img src={shown.path} alt={shown.name} className="max-w-full rounded-lg border" /> : null}
    </div>
  )
}
