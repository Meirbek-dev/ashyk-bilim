import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/verify-email')({
  staticData: { title: m.platform_page_verify_email, layout: 'focus' },
  component: UnderConstruction,
})
