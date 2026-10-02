import { createFileRoute } from '@tanstack/react-router'

import { requireCapability } from '#/shared/auth/access'

// The teach workspace: its capability and each section's come from the table in shared/auth/access.ts.
export const Route = createFileRoute('/_authed/teach')({ beforeLoad: requireCapability })
