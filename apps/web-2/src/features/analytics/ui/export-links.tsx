import { useSuspenseQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'

import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { Anchor } from '#/shared/components/anchor'
import { buttonVariants } from '#/shared/ui/button'

/** CSV downloads as plain links (the browser saves the file); only with the `analytics.export` capability. */
export function ExportLinks({ links }: { links: readonly { href: string; label: string }[] }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (!hasCapability(session, 'analytics.export')) return null
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(link => (
        <Anchor key={link.href} className={buttonVariants({ variant: 'outline' })} href={link.href} download>
          <Download aria-hidden />
          {link.label}
        </Anchor>
      ))}
    </div>
  )
}
