import { createFileRoute } from '@tanstack/react-router'

import { requireGuest } from '#/shared/auth/session'

export const Route = createFileRoute('/_guest')({ beforeLoad: requireGuest })
