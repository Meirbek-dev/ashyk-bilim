import { createFileRoute } from '@tanstack/react-router'

import { ResetPasswordPage } from '#/features/auth'
import { verifyEmailSearchSchema } from '#/features/auth/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/reset-password')({
  validateSearch: verifyEmailSearchSchema,
  staticData: { title: m.platform_page_reset_password, layout: 'focus' },
  component: ResetPasswordPage,
})
