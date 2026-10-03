import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

// The player's entry card links here; slice 5.4 (file submission) replaces the stub.
export const Route = createFileRoute('/_authed/learn/$courseId/$activityId_/submission')({
  staticData: { title: m.player_page_submission, layout: 'focus' },
  component: UnderConstruction,
})
