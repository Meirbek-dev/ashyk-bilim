import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

import { ApiError } from '#/shared/api/errors'
import { installClientErrorReporting, reportClientError } from '#/shared/lib/client-errors'

installClientErrorReporting()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
  {
    // Route errors reach the router's error boundaries (ErrorView). An ApiError is an expected state shown in place
    // (403, 404); anything else is a bug and goes to /_client-error. React's own console log is replaced by this.
    onCaughtError: error => {
      if (!(error instanceof ApiError)) reportClientError('render', error)
    },
  },
)
