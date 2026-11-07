import { Download } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/components/button-variants'

/** «Скачать CSV» of a grading list: a quiet button with the download icon, the same on every list. */
export function CsvLink({ href, className = '' }: { href: string; className?: string }) {
  return (
    <Anchor className={`${buttonVariants({ variant: 'ghost' })} ${className}`} href={href} download>
      <Download aria-hidden data-icon="inline-start" />
      {m.grading_export_csv()}
    </Anchor>
  )
}
