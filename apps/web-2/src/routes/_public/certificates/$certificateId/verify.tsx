import { createFileRoute } from '@tanstack/react-router'

import { CertificateInvalid, CertificateVerifyPage, ensureVerification } from '#/features/certificates'
import { verifyHead } from '#/features/certificates/route'
import { m } from '#/paraglide/messages'

// The canonical verify URL: `$certificateId` is the certificate's public verification code.
export const Route = createFileRoute('/_public/certificates/$certificateId/verify')({
  loader: ({ context, params }) => ensureVerification(context.queryClient, params.certificateId),
  staticData: { title: m.platform_page_certificate },
  head: verifyHead,
  component: () => <CertificateVerifyPage code={Route.useParams().certificateId} />,
  notFoundComponent: () => <CertificateInvalid code={Route.useParams().certificateId} />,
})
