import { notFound, rootRouteId, createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'

import {
  CertificateInvalid,
  CertificateVerifyPage,
  certificateHead,
  ensureVerification,
  printedLocale,
} from '#/features/certificates'
import { m } from '#/paraglide/messages'
import {
  cookieMaxAge,
  cookieName,
  getLocale,
  type Locale,
  serverAsyncLocalStorage,
  setLocale,
} from '#/paraglide/runtime'

// Opens the page in the certificate's language. On the server this very render switches (the locale lives in the
// request's store) and the cookie keeps it for hydration and later pages; no extra round trip, no redirect loop
// for browsers that drop cookies. A client-side navigation here is a reload in the new language.
const applyPrintedLanguage = createIsomorphicFn()
  .server((locale: Locale) => {
    if (getLocale() === locale) return
    const store = serverAsyncLocalStorage?.getStore()
    if (store) store.locale = locale
    setCookie(cookieName, locale, { path: '/', maxAge: cookieMaxAge, sameSite: 'lax' })
  })
  .client((locale: Locale) => {
    if (getLocale() !== locale) void setLocale(locale)
  })

// A deliberate alias of /certificates/$certificateId/verify, not a redirect: issued PDFs print
// `/{ru|kz|en}/certificates/{code}/verify` (server `Language::web_prefix`) and the QR codes on paper never change.
export const Route = createFileRoute('/_public/$locale/certificates/$certificateId/verify')({
  beforeLoad: ({ params }) => {
    const locale = printedLocale(params.locale)
    if (!locale) throw notFound({ routeId: rootRouteId })
    applyPrintedLanguage(locale)
  },
  loader: ({ context, params }) => ensureVerification(context.queryClient, params.certificateId),
  staticData: { title: m.platform_page_certificate },
  head: ({ loaderData }) => ({ meta: loaderData ? certificateHead(loaderData) : [] }),
  component: () => <CertificateVerifyPage code={Route.useParams().certificateId} />,
  notFoundComponent: () => <CertificateInvalid code={Route.useParams().certificateId} />,
})
