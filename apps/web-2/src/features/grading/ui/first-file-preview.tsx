import { useSuspenseQuery } from '@tanstack/react-query'

import type { AttachedFile } from '#/shared/api/gen/types.gen'
import { PdfFrame } from '#/shared/components/pdf-frame'

import { downloadOptions } from '../queries'

/**
 * The attempt's first showable file, opened without a click (its short-lived inline path asked for on render). An
 * image fits the window's height: a phone photo of a page no longer fills three screens above the grade form.
 */
export function FirstFilePreview({ file }: { file: AttachedFile }) {
  const { data } = useSuspenseQuery({ ...downloadOptions(file.id, 'inline'), staleTime: 0 })
  return file.content_type === 'application/pdf' ? (
    <PdfFrame src={data.path} title={file.filename} />
  ) : (
    <img src={data.path} alt={file.filename} className="max-h-svh max-w-full rounded-lg border" />
  )
}
