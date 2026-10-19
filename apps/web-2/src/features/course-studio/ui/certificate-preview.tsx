import { type ReactNode, useState } from 'react'

import { certificationPreviewHref } from '#/features/certificates'
import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { Certification } from '#/shared/api/gen/types.gen'
import { PdfFrame } from '#/shared/components/pdf-frame'
import { Button } from '#/shared/ui/button'

/**
 * "Preview PDF": the server prints the template with the caller as holder and code PREVIEW. Opened on request (the
 * PDF is made on every read); a saved change (new `version`) loads the frame again.
 */
// `actions`: the other certificate buttons, in the same row (not a column of single buttons).
export function CertificatePreview({ certification, actions }: { certification: Certification; actions?: ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" aria-expanded={shown} onClick={() => setShown(!shown)}>
          {m.studio_certificate_preview()}
        </Button>
        {actions}
      </div>
      {shown ? (
        <PdfFrame
          key={certification.version}
          src={certificationPreviewHref(certification.id, getLocale())}
          title={m.studio_certificate_preview_title()}
        />
      ) : null}
    </div>
  )
}
