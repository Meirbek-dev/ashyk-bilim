'use client'

import { RouteErrorState } from '@/components/ui/route-error-state'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorState
      description="This course could not be loaded. Retry the request or use the support reference if it keeps failing."
      error={error}
      reset={reset}
      scope="shared-course-route"
      title="Course failed to load"
    />
  )
}
