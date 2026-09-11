import { Link } from '@/i18n/navigation'
import { getSiteUrl } from '@services/config/config'
import type React from 'react'

type AppLinkProps = React.ComponentProps<typeof Link> & { prefetch?: boolean }

// Callers still build hrefs with `getAbsoluteUrl()`. next-intl only prefixes
// relative hrefs with the locale, so an absolute site URL cost a 307 through
// the proxy on every click; strip the origin here so the prefix applies.
function toAppHref(href: AppLinkProps['href']): AppLinkProps['href'] {
  if (typeof href !== 'string') return href
  const site = getSiteUrl().replace(/\/+$/u, '')
  return site && href.startsWith(`${site}/`) ? href.slice(site.length) : href
}

export default function AppLink({ prefetch = false, children, href, ...rest }: AppLinkProps) {
  return (
    <Link prefetch={prefetch} href={toAppHref(href)} {...rest}>
      {children}
    </Link>
  )
}
