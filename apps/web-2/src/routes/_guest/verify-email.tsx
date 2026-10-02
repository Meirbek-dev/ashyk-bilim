import { createFileRoute } from '@tanstack/react-router'

import { VerifyEmailPage, verifyEmailSearchSchema } from '#/features/auth'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/verify-email')({
  validateSearch: verifyEmailSearchSchema,
  staticData: { title: m.auth_verify_title, layout: 'focus' },
  component: VerifyEmailPage,
})
