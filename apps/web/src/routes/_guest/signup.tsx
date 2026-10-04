import { createFileRoute } from '@tanstack/react-router'

import { SignupPage } from '#/features/auth'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/signup')({
  staticData: { title: m.auth_signup_title, layout: 'focus' },
  component: SignupPage,
})
