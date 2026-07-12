'use client'

import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { AIErrorRecovery } from '@/features/ai-experience'

import { useAIAdminSettings, useAIEvalDashboard, useAIUsage } from '../api/use-ai-usage'
import { AIEvalDashboardPanel } from './ai-eval-dashboard'
import { AIOperationsConsole } from './ai-operations-console'
import { AIFeatureToggles } from './ai-feature-toggles'
import { BudgetStatus } from './budget-status'
import { TokenUsageChart } from './token-usage-chart'

export function AIAdminPanel() {
  const t = useTranslations('AiExperience.aiAdminPanel')
  const usage = useAIUsage()
  const settings = useAIAdminSettings()
  const evals = useAIEvalDashboard()
  const error = usage.error ?? settings.error ?? evals.error

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>
      {error ? <AIErrorRecovery message={error.message} /> : null}
      <AIOperationsConsole />
      {usage.data ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <div className="flex flex-col gap-4">
            <TokenUsageChart usage={usage.data} />
            <BudgetStatus usage={usage.data} />
            <AIEvalDashboardPanel dashboard={evals.data} loading={evals.isLoading} />
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('settingsTitle')}</CardTitle>
                <CardDescription>{t('settingsDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {settings.data ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={settings.data.ai_enabled ? 'secondary' : 'destructive'}>
                        {settings.data.ai_enabled ? t('aiEnabled') : t('aiDisabled')}
                      </Badge>
                      <Badge variant={settings.data.provider_ready ? 'secondary' : 'outline'}>
                        {settings.data.provider_ready ? t('providerReady') : t('providerMissing')}
                      </Badge>
                      {settings.data.draft_mode_enabled ? <Badge variant="warning">{t('draftMode')}</Badge> : null}
                    </div>
                    <Separator />
                    <dl className="grid gap-3 text-sm">
                      <SettingMetric label={t('modelLabel')} value={settings.data.model} />
                      <SettingMetric
                        label={t('requestLimitLabel')}
                        value={settings.data.max_tokens_per_request.toLocaleString()}
                      />
                      <SettingMetric
                        label={t('outputLimitLabel')}
                        value={settings.data.max_output_tokens.toLocaleString()}
                      />
                    </dl>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('featureFlags')}</CardTitle>
                <CardDescription>{t('flagsDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {settings.data ? (
                  <AIFeatureToggles features={settings.data.features} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      )}
    </section>
  )
}

function SettingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{value}</dd>
    </div>
  )
}
