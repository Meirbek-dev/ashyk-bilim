'use client'

import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'

import type { AIFeatureSetting } from '../api/use-ai-usage'

const FEATURE_LABEL_KEYS: Record<string, string> = {
  course_analysis_enabled: 'course-analysis',
  submission_analysis_enabled: 'submission-analysis',
  remediation_enabled: 'remediation',
  course_qa_enabled: 'course-qa',
  study_companion_enabled: 'study-companion',
  lecture_authoring_enabled: 'lecture-authoring',
  semantic_memory_enabled: 'semantic-memory',
}

export function AIFeatureToggles({ features }: { features: AIFeatureSetting[] }) {
  const t = useTranslations('AiExperience.featureToggles')
  return (
    <div className="flex flex-col gap-3">
      {features.map(feature => {
        const labelKey = FEATURE_LABEL_KEYS[feature.key] ?? feature.key
        return (
          <Field key={feature.key} orientation="horizontal" data-disabled={!feature.editable || undefined}>
            <FieldContent>
              <div className="flex flex-wrap items-center gap-2">
                <FieldLabel>{t(labelKey)}</FieldLabel>
                <Badge variant={feature.enabled ? 'secondary' : 'outline'}>
                  {feature.enabled ? t('enabled') : t('disabled')}
                </Badge>
              </div>
              <FieldDescription>{t('source', { source: feature.source })}</FieldDescription>
            </FieldContent>
            <Switch checked={feature.enabled} disabled={!feature.editable} aria-label={t(labelKey)} />
          </Field>
        )
      })}
      {features.length === 0 ? (
        <Field data-disabled>
          <FieldContent>
            <FieldLabel>{t('empty')}</FieldLabel>
            <FieldDescription>{t('description')}</FieldDescription>
          </FieldContent>
        </Field>
      ) : null}
    </div>
  )
}
