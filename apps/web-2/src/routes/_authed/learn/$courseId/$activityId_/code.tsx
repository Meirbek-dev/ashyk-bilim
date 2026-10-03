import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

// The player's entry card links here; slice 5.3 (code arena) replaces the stub.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId_/code')({
  staticData: { title: m.player_page_code, layout: 'focus' },
  component: UnderConstruction,
})
