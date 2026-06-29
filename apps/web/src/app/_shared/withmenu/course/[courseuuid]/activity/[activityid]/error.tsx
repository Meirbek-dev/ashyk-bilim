'use client'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      description="This activity could not be loaded. Retry the request or use the support reference if it keeps failing."
      error={error}
      reset={reset}
      scope="shared-activity-route"
      title="Activity failed to load"
    />
  )
}
