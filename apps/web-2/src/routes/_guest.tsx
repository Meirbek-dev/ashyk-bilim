import { createFileRoute } from '@tanstack/react-router'

import { opensVerifyLink } from '#/features/auth/route'
import { requireGuest } from '#/shared/auth/session'

export const Route = createFileRoute('/_guest')({
  ssr: true,
  beforeLoad: input => (opensVerifyLink(input.location, input.context.session) ? undefined : requireGuest(input)),
})
