import { useState } from 'react'

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
export function CertificatePreview({ certification }: { certification: Certification }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex flex-col items-start gap-4">
      <Button variant="outline" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {m.studio_certificate_preview()}
      </Button>
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
