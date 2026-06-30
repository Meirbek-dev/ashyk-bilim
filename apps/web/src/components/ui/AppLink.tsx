import { Link } from '@/i18n/navigation'
import type React from 'react'

type AppLinkProps = React.ComponentProps<typeof Link> & { prefetch?: boolean }

export default function AppLink({ prefetch = false, children, ...rest }: AppLinkProps) {
  return (
    <Link prefetch={prefetch} {...rest}>
      {children}
    </Link>
  )
}
