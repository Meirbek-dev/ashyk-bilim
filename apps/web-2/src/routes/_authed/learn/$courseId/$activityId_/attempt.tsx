import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

// The player's entry card links here; slice 5.2 (quiz and exam attempt) replaces the stub.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId_/attempt')({
  staticData: { title: m.player_page_attempt, layout: 'focus' },
  component: UnderConstruction,
})
