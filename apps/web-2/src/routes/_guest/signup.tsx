import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_guest/signup')({
  staticData: { title: m.platform_nav_signup, layout: 'focus' },
  component: UnderConstruction,
})
