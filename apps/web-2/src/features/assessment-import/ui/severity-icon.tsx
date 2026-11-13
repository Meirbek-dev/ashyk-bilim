import { CircleX, Info, TriangleAlert } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { IssueSeverity } from '#/shared/api/gen/types.gen'

export const severityLabels: Record<IssueSeverity, () => string> = {
  error: m.assessment_import_severity_error,
  warning: m.assessment_import_severity_warning,
  info: m.assessment_import_severity_info,
}

const icons = {
  error: <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />,
  warning: <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />,
  info: <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />,
} satisfies Record<IssueSeverity, unknown>

/** The level of an issue: icon and color, and its name for screen readers (color is never the only signal). */
export function SeverityIcon({ severity }: { severity: IssueSeverity }) {
  return (
    <>
      {icons[severity]}
      <span className="sr-only">{severityLabels[severity]()}: </span>
    </>
  )
}
