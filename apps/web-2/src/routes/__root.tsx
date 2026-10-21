import { createRootRouteWithContext, isNotFound } from '@tanstack/react-router'

import { AppShell, NotFoundView, RootDocument, RootErrorView } from '#/features/platform'
import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { RouterContext } from '#/shared/api/query-client'
import { sessionOptions } from '#/shared/auth/session'
import { documentTitle } from '#/shared/lib/document-title'
import { ssrStatusHeaders } from '#/shared/lib/ssr-status'
import appCss from '#/styles/globals.css?url'
import brandPalette from '../../public/brand/palette.json'

const failedTitle = (error: unknown) => {
  if (isNotFound(error)) return m.platform_not_found_title()
  if (error instanceof ApiError && error.status === 403) return m.platform_forbidden_title()
  if (error instanceof ApiError && error.status === 404) return m.platform_not_found_title()
  return m.platform_error_title()
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => ({
    session: await context.queryClient.query({ ...sessionOptions(), staleTime: 'static' }),
  }),
  head: ({ matches }) => {
    // The deepest route with a title names the document; a route's own head may still override it. A page that
    // could not show its object says so instead («Страница не найдена», «Нет доступа»), not the name of its tab.
    // A tab names its section too («Учащиеся · Аналитика»): its parent route's title follows its own.
    const failed = matches.find(match => match.status === 'notFound' || match.status === 'error')
    const page = matches.findLast(match => match.staticData.title)
    const name = page?.staticData.title?.()
    const section = page ? matches[matches.indexOf(page) - 1]?.staticData.title?.() : undefined
    const title = failed ? failedTitle(failed.error) : name && section ? `${name} · ${section}` : name
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
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48 64x64 128x128 256x256' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' },
      ],
    }
  },
  headers: ssrStatusHeaders,
  shellComponent: RootDocument,
  component: AppShell,
  errorComponent: RootErrorView,
  notFoundComponent: NotFoundView,
})
