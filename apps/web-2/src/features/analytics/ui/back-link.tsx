import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'

/** Leaves a performance drill-down: back to both lists, the filters kept. */
export function BackLink() {
  return (
    <Link
      variant="ghost"
      to="."
      search={prev => ({ ...prev, courseId: undefined, assessmentType: undefined, assessmentId: undefined, page: 1 })}
    >
      <ArrowLeft aria-hidden />
      {m.analytics_back()}
    </Link>
  )
}
