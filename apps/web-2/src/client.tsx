import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

import { installClientErrorReporting } from '#/shared/lib/client-errors'

installClientErrorReporting()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)
