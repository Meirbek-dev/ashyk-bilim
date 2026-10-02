import { createFileRoute } from '@tanstack/react-router'

import { LandingPage } from '#/features/platform'

export const Route = createFileRoute('/_guest/')({ component: LandingPage })
