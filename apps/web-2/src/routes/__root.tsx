import { createRootRouteWithContext } from '@tanstack/react-router'

import { AppShell, NotFoundView, RootDocument, RootErrorView } from '#/features/platform'
import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { RouterContext } from '#/shared/api/query-client'
import { sessionOptions } from '#/shared/auth/session'
import { documentTitle, ogLocale, pageTitle, pageUrl, siteOrigin } from '#/shared/lib/document-title'
import { ssrStatusHeaders } from '#/shared/lib/ssr-status'
import appCss from '#/styles/globals.css?url'
import brandPalette from '../../public/brand/palette.json'

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => ({
    session: await context.queryClient.query({ ...sessionOptions(), staleTime: 'static' }),
  }),
  head: ({ matches }) => {
    const title = pageTitle(matches)
    const url = pageUrl(siteOrigin(), matches.at(-1)?.pathname)
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'application-name', content: m.platform_brand() },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'theme-color', content: brandPalette.navy },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: m.platform_brand() },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { title: documentTitle(title) },
        { property: 'og:url', content: url },
        { property: 'og:locale', content: ogLocale(getLocale()) },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48 64x64 128x128 256x256' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' },
        { rel: 'canonical', href: url },
      ],
    }
  },
  headers: ssrStatusHeaders,
  shellComponent: RootDocument,
  component: AppShell,
  errorComponent: RootErrorView,
  notFoundComponent: NotFoundView,
})
