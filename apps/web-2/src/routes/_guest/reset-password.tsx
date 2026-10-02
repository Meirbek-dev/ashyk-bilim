import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/reset-password')({
  staticData: { title: m.platform_page_reset_password, layout: 'focus' },
  component: UnderConstruction,
})
