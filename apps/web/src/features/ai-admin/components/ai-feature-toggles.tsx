'use client'

import { Switch } from '@/components/ui/switch'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'

const FEATURES = [
  ['course-analysis', 'Course analysis'],
  ['submission-analysis', 'Submission analysis'],
  ['remediation', 'Adaptive remediation'],
  ['study-companion', 'Study companion'],
  ['course-qa', 'Course Q&A'],
] as const

export function AIFeatureToggles({ enabled = {} }: { enabled?: Record<string, boolean> }) {
  return (
    <div className="flex flex-col gap-3">
      {FEATURES.map(([key, label]) => (
        <Field key={key} orientation="horizontal" data-disabled>
          <FieldContent>
            <FieldLabel>{label}</FieldLabel>
            <FieldDescription>Managed by backend feature flags.</FieldDescription>
          </FieldContent>
          <Switch checked={Boolean(enabled[key])} disabled />
        </Field>
      ))}
    </div>
  )
}
