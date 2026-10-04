import { createFileRoute } from '@tanstack/react-router'

import { LoginPage } from '#/features/auth'
import { loginSearchSchema } from '#/features/auth/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/login')({
  validateSearch: loginSearchSchema,
  staticData: { title: m.auth_login_title, layout: 'focus' },
  component: LoginPage,
})
