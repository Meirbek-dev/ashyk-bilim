import { Download } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'

import { certificatePdfHref } from '../model/certificates'

/** The server-made PDF in the interface language as a plain download link: the browser saves the `attachment`. */
export function CertificatePdfLink({ code, variant = 'outline' }: { code: string; variant?: 'default' | 'outline' }) {
  return (
    <Anchor href={certificatePdfHref(code, getLocale())} className={buttonVariants({ variant })} download>
      <Download aria-hidden />
      {m.certificates_download_pdf()}
    </Anchor>
  )
}
