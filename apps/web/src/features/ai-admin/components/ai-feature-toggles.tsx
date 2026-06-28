'use client'

import { useTranslations } from 'next-intl'

import { Switch } from '@/components/ui/switch'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'

const FEATURES = ['course-analysis', 'submission-analysis', 'remediation', 'study-companion', 'course-qa'] as const
const DEFAULT_ENABLED: Record<string, boolean> = {}

export function AIFeatureToggles({ enabled = DEFAULT_ENABLED }: { enabled?: Record<string, boolean> }) {
  const t = useTranslations('AiExperience.featureToggles')
  return (
    <div className="flex flex-col gap-3">
      {FEATURES.map(key => (
        <Field key={key} orientation="horizontal" data-disabled>
          <FieldContent>
            <FieldLabel>{t(key)}</FieldLabel>
            <FieldDescription>{t('description')}</FieldDescription>
          </FieldContent>
          <Switch checked={Boolean(enabled[key])} disabled />
        </Field>
      ))}
    </div>
  )
}
