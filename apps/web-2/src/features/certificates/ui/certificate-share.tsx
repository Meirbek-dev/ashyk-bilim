import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'
import { siteOrigin } from '#/shared/lib/document-title'
import { Button } from '#/shared/ui/button'

import { linkedInAddHref, verifyUrl } from '../model/certificates'

type ShareProps = {
  code: string
  name: string
  issuedAtUnix: number
  linkedIn?: boolean
  /** ghost in a row of quiet actions (My certificates), outline beside a primary one (the verify page). */
  variant?: 'outline' | 'ghost'
}

/**
 * Sharing a certificate (B-CRT-09): its public verify link to the clipboard, and for the holder LinkedIn's
 * "add certification" form prefilled.
 */
export function CertificateShare({ code, name, issuedAtUnix, linkedIn = false, variant = 'outline' }: ShareProps) {
  const [copied, setCopied] = useState(false)
  const url = verifyUrl(siteOrigin(), code)
  // Clipboard refused (an old browser, a denied permission): the page itself opens, its address ready to copy.
  const copy = () =>
    void navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => window.open(url, '_blank', 'noopener'),
    )
  return (
    <>
      <Button variant={variant} onClick={copy}>
        {copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
        {copied ? m.certificates_link_copied() : m.certificates_copy_link()}
      </Button>
      {linkedIn ? (
        <Anchor
          href={linkedInAddHref({ name, issuer: m.platform_brand(), issuedAtUnix, code, url })}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'ghost' })}
        >
          {m.certificates_linkedin()}
        </Anchor>
      ) : null}
    </>
  )
}
