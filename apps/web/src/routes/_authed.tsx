import { createFileRoute } from '@tanstack/react-router'

import { requireSession } from '#/shared/auth/session'

// Everything behind sign-in: loaders run on the server, components render in the browser (spec 7.4).
export const Route = createFileRoute('/_authed')({ ssr: 'data-only', beforeLoad: requireSession })
