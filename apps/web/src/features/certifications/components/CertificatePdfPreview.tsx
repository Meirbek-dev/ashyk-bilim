'use client'

import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useSyncExternalStore } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

interface CertificatePdfPreviewProps {
  /** Cache key of this exact PDF (code / certification version + locale). */
  queryKey: readonly unknown[]
  load: () => Promise<Blob>
  title: string
  /** Wraps the frame (card + heading); nothing at all is rendered where no frame can be shown. */
  frame?: (preview: ReactNode) => ReactNode
}

const noop = () => () => {}
/** Phones and in-app browsers draw no PDF inside a page (an empty frame); the page's download button stays. */
const pdfViewerEnabled = () => (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false

/**
 * The certificate exactly as the server prints it (the university template), shown in a frame from a Blob:
 * the PDF endpoints answer `attachment`, so a frame pointed at them would download instead of showing.
 */
export function CertificatePdfPreview({ queryKey, load, title, frame = node => node }: CertificatePdfPreviewProps) {
  const canShow = useSyncExternalStore(noop, pdfViewerEnabled, () => false)
  const { data: url, isError } = useQuery({
    queryKey: ['certificate-pdf', ...queryKey],
    // ponytail: the object URL is never revoked (one ~200 KB PDF per distinct certificate per tab).
    queryFn: async () => URL.createObjectURL(await load()),
    enabled: canShow,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  if (!canShow || isError) return null
  if (!url) return frame(<Skeleton className="aspect-[297/210] w-full rounded-lg" />)
  return frame(
    <iframe
      src={`${url}#toolbar=0&navpanes=0&view=FitH`}
      title={title}
      className="aspect-[297/210] w-full rounded-lg border"
      data-testid="certificate-pdf-preview"
    />,
  )
}
