import { notFound, redirect, rootRouteId, createFileRoute } from '@tanstack/react-router'

import { CertificateInvalid, CertificateVerifyPage, ensureVerification } from '#/features/certificates'
import { certificateHead } from '#/features/certificates/route'
import { m } from '#/paraglide/messages'
import { printedAlias, printedLocale } from '#/shared/i18n/printed-locale'

// The page speaks the certificate's language (locale strategy `custom-printed`, shared/i18n/printed-locale.ts)
// without touching the visitor's own; a client-side navigation away reloads in the visitor's language (router.tsx).
//
// A deliberate alias of /certificates/$certificateId/verify, not a redirect: issued PDFs print
// `/{ru|kz|en}/certificates/{code}/verify` (server `Language::web_prefix`) and the QR codes on paper never change.
export const Route = createFileRoute('/_public/$locale/certificates/$certificateId/verify')({
  beforeLoad: ({ params }) => {
    if (printedLocale(params.locale)) return
    // The old web also answered `/kk/`, `/ru-RU/`, `/KZ/`…: such a link moves to the printed form.
    const printed = printedAlias(params.locale)
    if (printed) throw redirect({ href: `/${printed}/certificates/${params.certificateId}/verify`, statusCode: 301 })
    throw notFound({ routeId: rootRouteId })
  },
  loader: ({ context, params }) => ensureVerification(context.queryClient, params.certificateId),
  staticData: { title: m.platform_page_certificate, notFoundTitle: m.certificates_not_found },
  head: ({ loaderData }) => ({ meta: loaderData ? certificateHead(loaderData) : [] }),
  component: () => <CertificateVerifyPage code={Route.useParams().certificateId} />,
  notFoundComponent: () => <CertificateInvalid code={Route.useParams().certificateId} />,
})
