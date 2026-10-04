import { Download } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/ui/button'

import { certificatePdfHref } from '../model/certificates'

/** The server-made PDF as a plain download link: the browser saves the API's `attachment` answer. */
export function CertificatePdfLink({ code, variant = 'outline' }: { code: string; variant?: 'default' | 'outline' }) {
  return (
    <Anchor href={certificatePdfHref(code)} className={buttonVariants({ variant })} download>
      <Download aria-hidden />
      {m.certificates_download_pdf()}
    </Anchor>
  )
}
