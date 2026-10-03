import { BadgeX } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'

/** An unknown code: the certificate is not valid. The API does not tell "never issued" from "withdrawn". */
export function CertificateInvalid({ code }: { code: string }) {
  return (
    <section className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{m.certificates_not_found()}</h1>
        <StatusBadge tone="destructive">
          <BadgeX aria-hidden className="size-3" />
          {m.certificates_invalid()}
        </StatusBadge>
      </div>
      <p className="max-w-prose wrap-anywhere">{m.certificates_not_found_hint({ code })}</p>
    </section>
  )
}
