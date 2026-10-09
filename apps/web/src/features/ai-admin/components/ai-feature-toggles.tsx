'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { useApiError } from '@/hooks/useApiError'
import { apiJson } from '@/lib/api-client'
import { AdminSettings } from '@/lib/api/generated/zod'

import { aiAdminSettingsQueryOptions } from '../api/use-ai-usage'
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

/**
 * QA-D: the runtime switches (`PUT /ai/admin/settings/features/{key}`) had no web entry - the card said
 * «change the flags in the server environment». An editable feature is a switch; one the environment turns
 * off stays a read-only badge (the environment is the ceiling).
 */
export function AIFeatureToggles({ features }: { features: AIFeatureSetting[] }) {
  const t = useTranslations('AiExperience.featureToggles')
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiJson(
        `ai/admin/settings/features/${encodeURIComponent(key)}`,
        { method: 'PUT', body: JSON.stringify({ enabled }) },
        value => AdminSettings.parse(value),
      ),
    onSuccess: settings => {
      queryClient.setQueryData(aiAdminSettingsQueryOptions().queryKey, settings)
      toast.success(t('saved'))
    },
    onError: error => toastApiError(error, { fallback: t('saveFailed') }),
  })
  const sources = [...new Set(features.map(feature => feature.source))]
  return (
    <div className="flex flex-col gap-3">
      {sources.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t('source', {
            source: sources.map(source => (t.has(`sources.${source}`) ? t(`sources.${source}`) : source)).join(', '),
          })}
        </p>
      ) : null}
      {features.map(feature => {
        const labelKey = FEATURE_LABEL_KEYS[feature.key] ?? feature.key
        const label = t.has(labelKey) ? t(labelKey) : feature.key
        return (
          <Field key={feature.key} orientation="horizontal">
            <FieldContent>
              <div className="flex flex-wrap items-center gap-2">
                <FieldLabel>{label}</FieldLabel>
                {feature.editable ? null : (
                  <Badge variant={feature.enabled ? 'secondary' : 'outline'}>
                    {feature.enabled ? t('enabled') : t('disabledByEnvironment')}
                  </Badge>
                )}
              </div>
            </FieldContent>
            {feature.editable ? (
              <Switch
                aria-label={label}
                checked={feature.enabled}
                disabled={toggle.isPending}
                onCheckedChange={enabled => toggle.mutate({ key: feature.key, enabled })}
              />
            ) : null}
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
