import { notFound, rootRouteId, createFileRoute } from '@tanstack/react-router'

import { CertificateInvalid, CertificateVerifyPage, ensureVerification } from '#/features/certificates'
import { verifyHead } from '#/features/certificates/route'
import { m } from '#/paraglide/messages'
import { printedLocale } from '#/shared/i18n/printed-locale'

// The page speaks the certificate's language (locale strategy `custom-printed`, shared/i18n/printed-locale.ts)
// without touching the visitor's own; a client-side navigation away reloads in the visitor's language (router.tsx).
//
// A deliberate alias of /certificates/$certificateId/verify, not a redirect: issued PDFs print
// `/{ru|kz|en}/certificates/{code}/verify` (server `Language::web_prefix`) and the QR codes on paper never change.
export const Route = createFileRoute('/_public/$locale/certificates/$certificateId/verify')({
  beforeLoad: ({ params }) => {
    if (!printedLocale(params.locale)) throw notFound({ routeId: rootRouteId })
  },
  loader: ({ context, params }) => ensureVerification(context.queryClient, params.certificateId),
  staticData: { title: m.platform_page_certificate },
  head: verifyHead,
  component: () => <CertificateVerifyPage code={Route.useParams().certificateId} />,
  notFoundComponent: () => <CertificateInvalid code={Route.useParams().certificateId} />,
})
