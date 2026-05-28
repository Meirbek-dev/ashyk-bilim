import { Link } from '@/i18n/navigation'
import React from 'react'

// Server-side wrapper for Next.js Link that uses default prefetch
// behavior for same-origin internal routes unless explicitly disabled.
type ServerLinkProps = React.ComponentProps<typeof Link> & { prefetch?: boolean }

export default function ServerLink({ prefetch, children, ...rest }: ServerLinkProps) {
  return (
    <Link prefetch={prefetch} {...rest}>
      {children}
    </Link>
  )
}
