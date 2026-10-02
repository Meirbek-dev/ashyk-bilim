import { createFileRoute } from '@tanstack/react-router'

import { LoginPage, loginSearchSchema } from '#/features/auth'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/login')({
  validateSearch: loginSearchSchema,
  staticData: { title: m.auth_login_title, layout: 'focus' },
  head: () => ({ meta: [{ title: m.auth_login_title() }] }),
  component: LoginPage,
})
